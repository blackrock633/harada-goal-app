'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { clsx } from 'clsx';
import type { GoalDetailDTO } from '@/application/dto';
import { routes } from '@/ui/routes';
import { SLOT_COUNT, buildMatrix, cellAt, doneLabel, type MatrixArea } from './matrix-model';

export interface MatrixOverviewProps {
  goal: GoalDetailDTO;
  className?: string;
}

/** Phone-first 3x3 map: goal in the middle, 8 key areas around it (clockwise from top-left). */
export function MatrixOverview({ goal, className }: MatrixOverviewProps) {
  const m = React.useMemo(() => buildMatrix(goal), [goal]);
  const tiles: React.ReactNode[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ref = cellAt(3 + r, 3 + c)!;
      if (ref.kind === 'goal') {
        tiles.push(
          <Link
            key="goal"
            href={routes.goal(goal.id)}
            title={goal.title}
            aria-label={`Goal: ${goal.title}`}
            data-testid="overview-goal"
            className="flex min-h-[104px] min-w-0 flex-col justify-center rounded-[var(--radius-md)] border-2 border-accent bg-accent p-2 text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            <span className="text-xs font-bold uppercase tracking-wide">Goal</span>
            <span className="line-clamp-3 font-serif text-sm font-bold leading-tight [overflow-wrap:anywhere]">{goal.title}</span>
          </Link>,
        );
      } else {
        tiles.push(<AreaTile key={ref.areaPosition} area={m.areas[ref.areaPosition!]!} goalId={goal.id} />);
      }
    }
  }
  return (
    <section aria-label="Key area map" className={clsx('min-w-0', className)}>
      <div className="grid grid-cols-3 gap-2" data-testid="overview-grid">
        {tiles}
      </div>
      <div className="mt-3 text-sm" data-testid="completeness">
        <p className="font-medium text-ink">
          Plan: {m.filledPositions} of {m.totalPositions} positions filled
        </p>
        <p className="text-ink-muted">
          {m.filledAreas} of 8 key areas · {m.filledActions} of 64 actions
        </p>
        <p className="text-ink-muted">{doneLabel(m.completedActions, m.filledActions)}</p>
      </div>
    </section>
  );
}

function AreaTile({ area, goalId }: { area: MatrixArea; goalId: string }) {
  const n = area.position + 1;
  const o = area.outcome;
  const href = routes.keyArea(goalId, area.position);
  if (!o) {
    return (
      <Link
        href={href}
        aria-label={`Key area ${n}: empty, add key area`}
        className="flex min-h-[104px] min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border border-dashed border-rule-strong bg-paper p-2 text-center text-ink-muted hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="text-xs font-semibold uppercase tracking-wide">Key area {n}</span>
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs font-medium">Add key area</span>
      </Link>
    );
  }
  return (
    <Link
      href={href}
      title={o.title}
      aria-label={`Key area ${n}: ${o.title}, ${area.actionCount} of ${SLOT_COUNT} actions planned. ${doneLabel(area.doneCount, area.actionCount)}`}
      className="flex min-h-[104px] min-w-0 flex-col justify-between rounded-[var(--radius-md)] border border-rule-strong bg-accent-soft p-2 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="min-w-0">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Key area {n}</span>
        <span className="line-clamp-2 block text-sm font-medium leading-tight text-ink [overflow-wrap:anywhere]">{o.title}</span>
      </div>
      <div>
        <span className="block text-xs tabular-nums text-ink-muted">{area.actionCount}/{SLOT_COUNT} actions</span>
        <span className="mt-1 flex gap-[3px]" aria-hidden="true">
          {area.slots.map((s) => (
            <span
              key={s.position}
              className={clsx(
                'h-1.5 flex-1 rounded-full',
                !s.action ? 'bg-rule' : s.action.kind === 'task' && s.action.completedAt ? 'bg-success' : 'border border-ink-faint bg-transparent',
              )}
            />
          ))}
        </span>
        <span className="block text-xs tabular-nums text-ink-muted">{doneLabel(area.doneCount, area.actionCount)}</span>
      </div>
    </Link>
  );
}
