'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Plus, Repeat } from 'lucide-react';
import { clsx } from 'clsx';
import type { ActionDTO, GoalDetailDTO } from '@/application/dto';
import type { MatrixMutations } from '@/ui/actions';
import { routes } from '@/ui/routes';
import { ActionEditorSheet, type ActionEditorMode } from './ActionEditorSheet';
import {
  GOAL_COORDS,
  buildMatrix,
  cellAt,
  hubLabel,
  slotLabel,
  type MatrixArea,
} from './matrix-model';

export interface FullMatrixProps {
  goal: GoalDetailDTO;
  mutations: Pick<MatrixMutations, 'addAction' | 'updateAction'>;
  onActionSaved?: (action: ActionDTO) => void;
  /** Visibility (e.g. "hidden lg:block") is the page's responsibility. */
  className?: string;
}

const key = (r: number, c: number) => `${r}-${c}`;

/**
 * The true 9x9 Open Window 64 grid. Key areas appear twice (hub in the centre block and at
 * the centre of their own block) with the same accent-soft styling and "Key area N" eyebrow.
 * Roving tabindex; arrows/Home/End move, Enter/Space activates (links navigate, action cells
 * open the editor sheet).
 */
export function FullMatrix({ goal, mutations, onActionSaved, className }: FullMatrixProps) {
  const m = React.useMemo(() => buildMatrix(goal), [goal]);
  const [focus, setFocus] = React.useState<{ row: number; col: number }>(GOAL_COORDS);
  const [activeArea, setActiveArea] = React.useState<number | null>(null);
  const [editor, setEditor] = React.useState<ActionEditorMode | null>(null);
  const [open, setOpen] = React.useState(false);
  const gridRef = React.useRef<HTMLDivElement>(null);

  const focusCell = (row: number, col: number) => {
    setFocus({ row, col });
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${key(row, col)}"]`)?.focus();
  };

  function onKeyDown(e: React.KeyboardEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]');
    if (!el) return;
    const [row, col] = el.dataset.cell!.split('-').map(Number) as [number, number];
    let next: [number, number] | null = null;
    switch (e.key) {
      case 'ArrowUp': next = [Math.max(0, row - 1), col]; break;
      case 'ArrowDown': next = [Math.min(8, row + 1), col]; break;
      case 'ArrowLeft': next = [row, Math.max(0, col - 1)]; break;
      case 'ArrowRight': next = [row, Math.min(8, col + 1)]; break;
      case 'Home': next = [row, 0]; break;
      case 'End': next = [row, 8]; break;
      default: return;
    }
    e.preventDefault();
    focusCell(next[0], next[1]);
  }

  function openAction(area: MatrixArea, position: number) {
    if (!area.outcome) return;
    const a = area.slots[position]!.action;
    setEditor(
      a
        ? { type: 'edit', action: a }
        : { type: 'add', outcomeId: area.outcome.id, heading: `Key area ${area.position + 1}: ${area.outcome.title}` },
    );
    setOpen(true);
  }

  const rows = [];
  for (let row = 0; row < 9; row++) {
    const cells = [];
    for (let col = 0; col < 9; col++) {
      const ref = cellAt(row, col)!;
      const tab = focus.row === row && focus.col === col ? 0 : -1;
      const common = {
        'data-cell': key(row, col),
        tabIndex: tab,
        onFocus: () => {
          setFocus({ row, col });
          setActiveArea(ref.areaPosition);
        },
      } as const;
      const area = ref.areaPosition === null ? null : m.areas[ref.areaPosition]!;
      let inner: React.ReactNode;
      let base: string;
      if (ref.kind === 'goal') {
        base = 'border-2 border-accent bg-accent text-accent-ink';
        inner = (
          <Link {...common} href={routes.goal(goal.id)} title={goal.title} aria-label={`Goal: ${goal.title}`} className={cell(base)}>
            <span className="text-xs font-bold uppercase tracking-wide">Goal</span>
            <span className="line-clamp-3 font-serif text-xs font-bold leading-tight [overflow-wrap:anywhere]">{goal.title}</span>
          </Link>
        );
      } else if (ref.kind === 'hub' || ref.kind === 'centre') {
        const a = area!;
        const linked = activeArea === a.position;
        base = clsx(
          'border bg-accent-soft text-ink',
          a.outcome ? 'border-accent/60' : 'border-dashed border-accent/60',
          linked && 'ring-2 ring-accent',
        );
        inner = (
          <Link
            {...common}
            href={routes.keyArea(goal.id, a.position)}
            title={a.outcome?.title}
            aria-label={ref.kind === 'hub' ? hubLabel(a) : `${hubLabel(a)} (centre of its block)`}
            className={cell(base)}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Key area {a.position + 1}</span>
            {a.outcome ? (
              <span className="line-clamp-2 text-xs font-semibold leading-tight [overflow-wrap:anywhere]">{a.outcome.title}</span>
            ) : (
              <Plus className="h-4 w-4 text-ink-faint" aria-hidden="true" />
            )}
          </Link>
        );
      } else {
        const a = area!;
        const slot = a.slots[ref.slotPosition!]!;
        const act = slot.action;
        const done = !!act && act.kind === 'task' && !!act.completedAt;
        base = clsx(
          'border bg-surface',
          act ? 'border-rule-strong' : 'border-dashed border-rule',
          done && 'bg-surface-sunken text-ink-muted',
        );
        const label = slotLabel(a, slot);
        const body = act ? (
          <>
            <span className="flex items-center gap-0.5 text-ink-muted" aria-hidden="true">
              {act.kind === 'routine' ? <Repeat className="h-3 w-3" /> : done ? <Check className="h-3 w-3 text-success" /> : <span className="text-xs leading-none">○</span>}
            </span>
            <span className={clsx('line-clamp-2 text-xs leading-tight [overflow-wrap:anywhere]', done && 'line-through')}>{act.title}</span>
          </>
        ) : (
          <Plus className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />
        );
        inner = a.outcome ? (
          <button {...common} type="button" title={act?.title} aria-label={label} onClick={() => openAction(a, slot.position)} className={cell(base)}>
            {body}
          </button>
        ) : (
          <Link {...common} href={routes.keyArea(goal.id, a.position)} aria-label={label} className={cell(base)}>
            {body}
          </Link>
        );
      }
      cells.push(
        <div key={col} role="gridcell" className={clsx('min-w-0 flex-1 basis-0', col % 3 === 0 && col > 0 && 'ml-2')}>
          {inner}
        </div>,
      );
    }
    rows.push(
      <div key={row} role="row" className={clsx('flex gap-1', row % 3 === 0 && row > 0 && 'mt-2')}>
        {cells}
      </div>,
    );
  }

  return (
    <div className={clsx('min-w-0', className)}>
      <div
        ref={gridRef}
        role="grid"
        aria-label="Open Window 64: goal, 8 key areas, 64 actions"
        aria-rowcount={9}
        aria-colcount={9}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActiveArea(null);
        }}
        className="mx-auto w-full max-w-[960px]"
      >
        {rows}
      </div>
      <p className="mt-3 text-sm text-ink-muted" data-testid="full-completeness">
        Plan: {m.filledPositions} of {m.totalPositions} positions filled · {m.filledAreas} of 8 key areas · {m.filledActions} of 64 actions
      </p>
      {editor && (
        <ActionEditorSheet
          open={open}
          onOpenChange={setOpen}
          mode={editor}
          mutations={mutations}
          onSaved={onActionSaved}
        />
      )}
    </div>
  );
}

function cell(base: string) {
  return clsx(
    'flex aspect-square w-full min-w-0 flex-col items-start justify-between overflow-hidden rounded-[var(--radius-sm)] p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
    base,
    '[&>svg:only-child]:m-auto',
  );
}
