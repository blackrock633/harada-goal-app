import Link from 'next/link';
import type { GoalDetailDTO } from '@/application/dto';
import type { GoalMutations } from '@/ui/actions';
import { routes } from '@/ui/routes';
import { formatLocalDate } from '@/ui/format';
import { Badge } from '@/ui/primitives';
import { ActivateGoalButton } from './ActivateGoalButton';
import { NoKeyAreasEmptyState } from './EmptyStates';
import { PURPOSE_FIELDS, daysBetween } from './goalLogic';

export interface GoalOverviewProps {
  goal: GoalDetailDTO;
  /** Local date 'YYYY-MM-DD'. */
  today: string;
  activateGoal: GoalMutations['activateGoal'];
  onActivated?: (goal: import('@/application/dto').GoalFieldsDTO) => void;
}

const STATUS_LABEL = { draft: 'Draft', active: 'Active', achieved: 'Achieved', archived: 'Archived' } as const;
const PACE_LABEL = {
  ahead: 'Ahead (by measures)',
  on_track: 'On track (by measures)',
  behind: 'Behind (by measures)',
  overdue: 'Overdue (by measures)',
} as const;

function dayPhrase(target: string, today: string): string {
  const n = daysBetween(today, target);
  if (n === 0) return 'today';
  if (n === 1) return '1 day left';
  if (n > 1) return `${n} days left`;
  if (n === -1) return '1 day ago';
  return `${Math.abs(n)} days ago`;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function GoalOverview({ goal, today, activateGoal, onActivated }: GoalOverviewProps) {
  const { metrics } = goal;
  const rows = goal.matrix.outcomes;
  const filledAreas = rows.filter((o) => o !== null).length;
  const measured = goal.outcomes.filter((o) => o.measure !== null);
  const purposes = PURPOSE_FIELDS.filter((f) => goal.purpose[f.key].trim());
  const vision = goal.vision.trim();
  const criteria = goal.successCriteria.trim();
  const pace = goal.pace;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={goal.status}>{STATUS_LABEL[goal.status]}</Badge>
          {pace !== 'unknown' && <Badge variant={pace}>{PACE_LABEL[pace]}</Badge>}
        </div>
        <h1 className="font-serif text-3xl leading-tight text-ink break-words text-balance">{goal.title}</h1>
        <p className="text-ink-muted">
          {goal.targetDate ? (
            <>
              Target date: <span className="text-ink">{formatLocalDate(goal.targetDate, 'long')}</span>{' '}
              ({dayPhrase(goal.targetDate, today)})
            </>
          ) : (
            'No target date'
          )}
        </p>
        <nav aria-label="Goal links" className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium">
          <Link className="inline-flex min-h-[44px] items-center text-accent underline underline-offset-2" href={routes.goalEdit(goal.id)}>Edit goal</Link>
          <Link className="inline-flex min-h-[44px] items-center text-accent underline underline-offset-2" href={routes.matrix(goal.id)}>Open matrix</Link>
          <Link className="inline-flex min-h-[44px] items-center text-accent underline underline-offset-2" href={routes.review(goal.id)}>Review</Link>
        </nav>
        {goal.status === 'draft' && (
          <ActivateGoalButton goalId={goal.id} activateGoal={activateGoal} onActivated={onActivated} />
        )}
      </header>

      <section aria-labelledby="g-progress" className="space-y-4">
        <h2 id="g-progress" className="font-serif text-xl text-ink">Where things stand</h2>
        <dl className="divide-y divide-rule">
          <div className="py-3">
            <dt className="text-sm text-ink-muted">Plan</dt>
            <dd className="text-ink tabular-nums">{metrics.planning.filled} of {metrics.planning.total} positions filled</dd>
          </div>
          <div className="py-3">
            <dt className="text-sm text-ink-muted">Actions</dt>
            <dd className="text-ink tabular-nums">
              {/* UX-01: a zero denominator is "No tasks yet", never "0 of 0". */}
              {metrics.totalTasks === 0 ? 'No tasks yet' : `${metrics.completedTasks} of ${metrics.totalTasks} tasks done`}
            </dd>
          </div>
          {metrics.routineCount > 0 && (
            <div className="py-3">
              <dt className="text-sm text-ink-muted">Routines</dt>
              <dd className="text-ink tabular-nums">
                {metrics.routineCount} {metrics.routineCount === 1 ? 'routine' : 'routines'}
                <span className="block text-sm text-ink-muted">
                  {metrics.routineAdherence === null
                    ? 'No routine data yet'
                    : `Routines: ${Math.round(metrics.routineAdherence * 100)}% adherence over 28 days`}
                </span>
              </dd>
            </div>
          )}
          <div className="py-3">
            <dt className="text-sm text-ink-muted">Goal attainment</dt>
            <dd className="text-ink">
              {measured.length === 0 && metrics.attainment === null ? (
                <>
                  Not measured yet
                  <span className="block text-sm text-ink-muted">
                    Add a measure to a key area to track real results.
                  </span>
                </>
              ) : (
                <>
                <ul className="space-y-1">
                  {measured.map((o) => (
                    <li key={o.id} className="tabular-nums">
                      {o.title}: {fmtNum(o.measure!.current)} / {fmtNum(o.measure!.target)}
                      {o.measure!.unit ? ` ${o.measure!.unit}` : ''}
                    </li>
                  ))}
                </ul>
                {metrics.attainment !== null && (
                  <p className="mt-2 tabular-nums">
                    Measured attainment: {Math.round(metrics.attainment * 100)}%
                    <span className="block text-sm text-ink-muted">
                      Averaged from the measures on your key areas. Tasks and routines are not included.
                    </span>
                  </p>
                )}
                </>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {criteria && (
        <section aria-labelledby="g-criteria" className="space-y-2">
          <h2 id="g-criteria" className="font-serif text-xl text-ink">How you&apos;ll know</h2>
          <p className="whitespace-pre-wrap break-words text-ink">{criteria}</p>
        </section>
      )}

      {vision && (
        <section aria-labelledby="g-vision" className="space-y-2">
          <h2 id="g-vision" className="font-serif text-xl text-ink">Vision</h2>
          <p className="whitespace-pre-wrap break-words text-ink">{vision}</p>
        </section>
      )}

      {purposes.length > 0 && (
        <section aria-labelledby="g-why" className="space-y-3">
          <h2 id="g-why" className="font-serif text-xl text-ink">Why it matters</h2>
          <dl className="space-y-3">
            {purposes.map((f) => (
              <div key={f.key}>
                <dt className="text-sm text-ink-muted">{f.label}</dt>
                <dd className="whitespace-pre-wrap break-words text-ink">{goal.purpose[f.key]}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section aria-labelledby="g-areas" className="space-y-3">
        <h2 id="g-areas" className="font-serif text-xl text-ink">Key areas</h2>
        {filledAreas === 0 ? (
          <NoKeyAreasEmptyState goalId={goal.id} />
        ) : (
          <ol className="divide-y divide-rule border-y border-rule">
            {rows.map((o, i) => (
              <li key={i} className="flex min-h-[44px] items-center justify-between gap-3 py-2">
                {o ? (
                  <>
                    <Link href={routes.keyArea(goal.id, o.position ?? i)} className="min-w-0 break-words text-ink underline-offset-2 hover:underline">
                      <span className="mr-2 text-ink-muted tabular-nums">{i + 1}.</span>
                      {o.title}
                    </Link>
                    <span className="shrink-0 text-sm text-ink-muted tabular-nums">
                      {o.actions.filter((a) => a.archivedAt === null).length} actions
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-ink-muted">
                      <span className="mr-2 tabular-nums">{i + 1}.</span>Empty slot
                    </span>
                    <Link
                      href={routes.keyArea(goal.id, i)}
                      aria-label={`Add key area ${i + 1}`}
                      className="inline-flex min-h-[44px] items-center text-sm font-medium text-accent underline underline-offset-2"
                    >
                      Add
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
