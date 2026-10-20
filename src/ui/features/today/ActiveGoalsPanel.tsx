import Link from 'next/link';
import type { GoalSummaryDTO } from '@/application/dto';
import type { Pace } from '@/domain/types';
import { routes } from '@/ui/routes';
import { Badge } from '@/ui/primitives';

const PACE_LABEL: Record<Exclude<Pace, 'unknown'>, string> = {
  ahead: 'Ahead',
  on_track: 'On track',
  behind: 'Behind',
  overdue: 'Overdue',
};

/**
 * Shows honest counts only: tasks done, plan completeness and due-today. Never a merged percentage bar.
 * Pace is shown only when it exists, and it derives from measured attainment alone.
 */
export function ActiveGoalsPanel({ goals }: { goals: GoalSummaryDTO[] }) {
  if (goals.length === 0) return null;
  return (
    <section aria-labelledby="active-goals-heading" className="space-y-2">
      <h2 id="active-goals-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
        Active goals
      </h2>
      <ul className="space-y-3">
        {goals.map((g) => (
          <li key={g.id} className="rounded-[var(--radius-md)] border border-rule bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={routes.goal(g.id)}
                className="min-w-0 break-words font-serif text-lg font-semibold text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {g.title}
              </Link>
              <Badge variant="active" className="shrink-0 capitalize">
                {g.status}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-ink-muted">{g.dueTodayCount} due today</p>
            {g.metrics.totalTasks > 0 && (
              <p className="text-sm text-ink-muted">
                {g.metrics.completedTasks} of {g.metrics.totalTasks} tasks done
              </p>
            )}
            <p className="mt-1 text-xs text-ink-muted">
              {g.metrics.planning.filled}/{g.metrics.planning.total} planned
            </p>
            {g.pace !== 'unknown' && (
              <p className="mt-2">
                <Badge variant={g.pace}>{PACE_LABEL[g.pace]} (by measures)</Badge>
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
