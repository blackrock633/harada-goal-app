import * as React from 'react';
import { clsx } from 'clsx';
import { Repeat } from 'lucide-react';
import { AREA_COUNT, SLOT_COUNT, cellAt } from '@/application/matrix';

/**
 * A read-only Open Window 64 sheet for plain plan data (e.g. a starter template), laid out with the same
 * 9x9 / 3x3 geometry (`cellAt`) and cell styling as the app's FullMatrix and MatrixOverview. Server
 * component: no interactivity, no links into the app.
 */
export interface PlanSheetData {
  goalTitle: string;
  areas: { title: string; actions: { title: string; kind: 'task' | 'routine' }[] }[];
}

interface Area {
  position: number;
  title: string | null;
  slots: ({ title: string; kind: 'task' | 'routine' } | null)[];
}

function toAreas(data: PlanSheetData): Area[] {
  return Array.from({ length: AREA_COUNT }, (_, position) => {
    const a = data.areas[position];
    return {
      position,
      title: a?.title ?? null,
      slots: Array.from({ length: SLOT_COUNT }, (_, j) => a?.actions[j] ?? null),
    };
  });
}

const cellBase =
  'flex aspect-square w-full min-w-0 flex-col items-start justify-between overflow-hidden rounded-[var(--radius-sm)] p-1 text-left';

export function PlanSheet({ data, className }: { data: PlanSheetData; className?: string }) {
  const areas = toAreas(data);
  const filledAreas = areas.filter((a) => a.title).length;
  const filledActions = areas.reduce((n, a) => n + a.slots.filter(Boolean).length, 0);

  const rows: React.ReactNode[] = [];
  for (let row = 0; row < 9; row++) {
    const cells: React.ReactNode[] = [];
    for (let col = 0; col < 9; col++) {
      const ref = cellAt(row, col)!;
      let inner: React.ReactNode;
      if (ref.kind === 'goal') {
        inner = (
          <div className={clsx(cellBase, 'border-2 border-accent bg-accent text-accent-ink')}>
            <span className="text-xs font-bold uppercase tracking-wide">Goal</span>
            <span className="line-clamp-3 font-serif text-xs font-bold leading-tight [overflow-wrap:anywhere]">
              {data.goalTitle}
            </span>
          </div>
        );
      } else if (ref.kind === 'hub' || ref.kind === 'centre') {
        const a = areas[ref.areaPosition!]!;
        inner = (
          <div
            className={clsx(
              cellBase,
              'border bg-accent-soft text-ink',
              a.title ? 'border-accent/60' : 'border-dashed border-accent/60',
            )}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Area {a.position + 1}
            </span>
            {a.title && (
              <span className="line-clamp-2 text-xs font-semibold leading-tight [overflow-wrap:anywhere]">
                {a.title}
              </span>
            )}
          </div>
        );
      } else {
        const a = areas[ref.areaPosition!]!;
        const act = a.slots[ref.slotPosition!];
        inner = (
          <div className={clsx(cellBase, 'border bg-surface', act ? 'border-rule-strong' : 'border-dashed border-rule')}>
            {act && (
              <>
                <span className="text-ink-muted" aria-hidden="true">
                  {act.kind === 'routine' ? <Repeat className="h-3 w-3" /> : <span className="text-xs leading-none">○</span>}
                </span>
                <span className="line-clamp-2 text-xs leading-tight [overflow-wrap:anywhere]">{act.title}</span>
              </>
            )}
          </div>
        );
      }
      cells.push(
        <div key={col} className={clsx('min-w-0 flex-1 basis-0', col % 3 === 0 && col > 0 && 'ml-1.5')}>
          {inner}
        </div>,
      );
    }
    rows.push(
      <div key={row} className={clsx('flex gap-1', row % 3 === 0 && row > 0 && 'mt-1.5')}>
        {cells}
      </div>,
    );
  }

  return (
    <figure className={clsx('min-w-0', className)}>
      {/* The 9x9 grid is visual; the same content is given as a list for assistive technology and small screens. */}
      <div aria-hidden="true" className="mx-auto hidden w-full max-w-[880px] md:block" data-testid="plan-sheet-grid">
        {rows}
      </div>
      <div className="md:hidden">
        <CentreBlock goalTitle={data.goalTitle} areas={areas} />
      </div>
      <ol className="sr-only">
        {areas.map((a) => (
          <li key={a.position}>
            Key area {a.position + 1}: {a.title ?? 'open'}
            {a.title && (
              <ul>
                {a.slots.map((s, j) => (
                  <li key={j}>{s ? `${s.title} (${s.kind === 'routine' ? 'routine' : 'one-time task'})` : 'open action slot'}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      <figcaption className="mt-3 text-sm text-ink-muted">
        {filledAreas} of 8 key areas and {filledActions} of 64 actions are filled in — a starting point, not a finished plan.
      </figcaption>
    </figure>
  );
}

/** Phone layout: the centre 3x3 block (goal + 8 key areas) and the first area's own 3x3 block. */
function CentreBlock({ goalTitle, areas }: { goalTitle: string; areas: Area[] }) {
  const tiles: React.ReactNode[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ref = cellAt(3 + r, 3 + c)!;
      if (ref.kind === 'goal') {
        tiles.push(
          <div key="goal" className="flex min-h-[96px] min-w-0 flex-col justify-center rounded-[var(--radius-md)] border-2 border-accent bg-accent p-2 text-accent-ink">
            <span className="text-xs font-bold uppercase tracking-wide">Goal</span>
            <span className="line-clamp-3 font-serif text-sm font-bold leading-tight [overflow-wrap:anywhere]">{goalTitle}</span>
          </div>,
        );
      } else {
        const a = areas[ref.areaPosition!]!;
        tiles.push(
          <div
            key={a.position}
            className={clsx(
              'flex min-h-[96px] min-w-0 flex-col justify-between rounded-[var(--radius-md)] border p-2',
              a.title ? 'border-accent/60 bg-accent-soft' : 'border-dashed border-rule bg-surface',
            )}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Area {a.position + 1}</span>
            <span className={clsx('line-clamp-3 text-sm leading-tight [overflow-wrap:anywhere]', a.title ? 'font-medium text-ink' : 'text-ink-faint')}>
              {a.title ?? 'Open'}
            </span>
          </div>,
        );
      }
    }
  }
  const first = areas[0]!;
  return (
    <div aria-hidden="true" className="space-y-4">
      <div className="grid grid-cols-3 gap-2">{tiles}</div>
      {first.title && (
        <div>
          <p className="mb-2 text-sm text-ink-muted">Each key area becomes the centre of its own 3×3 block of 8 actions:</p>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 9 }, (_, i) => {
              const r = Math.floor(i / 3);
              const c = i % 3;
              if (r === 1 && c === 1) {
                return (
                  <div key={i} className="flex min-h-[72px] min-w-0 flex-col justify-center rounded-[var(--radius-sm)] border border-accent/60 bg-accent-soft p-1.5">
                    <span className="line-clamp-3 text-xs font-semibold leading-tight [overflow-wrap:anywhere]">{first.title}</span>
                  </div>
                );
              }
              const ref = cellAt(r, c)!;
              const act = first.slots[ref.slotPosition!];
              return (
                <div
                  key={i}
                  className={clsx(
                    'flex min-h-[72px] min-w-0 flex-col justify-between rounded-[var(--radius-sm)] border bg-surface p-1.5',
                    act ? 'border-rule-strong' : 'border-dashed border-rule',
                  )}
                >
                  {act && (
                    <>
                      <span className="text-ink-muted">
                        {act.kind === 'routine' ? <Repeat className="h-3 w-3" /> : <span className="text-xs leading-none">○</span>}
                      </span>
                      <span className="line-clamp-3 text-xs leading-tight [overflow-wrap:anywhere]">{act.title}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
