import Link from 'next/link';
import type { GoalSummaryDTO } from '@/application/dto';
import { routes } from '@/ui/routes';
import { Badge } from '@/ui/primitives';

/**
 * Deliberately shows no progress bar or pace badge: GoalSummaryDTO.progress/pace are derived from
 * action completion alone and are not an honest measure of goal progress. "Actions: X of Y" is
 * also omitted because openTaskCount excludes routines while actionCount includes them.
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
          </li>
        ))}
      </ul>
    </section>
  );
}
