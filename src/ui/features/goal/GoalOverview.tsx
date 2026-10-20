import Link from 'next/link';
import type { GoalDetailDTO, OutcomeDTO } from '@/application/dto';
import type { GoalMutations } from '@/ui/actions';
import { MAX_ACTIONS_PER_OUTCOME, MAX_OUTCOMES_PER_GOAL } from '@/domain/limits';
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
const TOTAL_POSITIONS = MAX_OUTCOMES_PER_GOAL * (1 + MAX_ACTIONS_PER_OUTCOME);

function dayPhrase(target: string, today: string): string {
  const n = daysBetween(today, target);
  if (n === 0) return 'today';
  if (n === 1) return '1 day left';
  if (n > 1) return `${n} days left`;
  if (n === -1) return '1 day ago';
  return `${Math.abs(n)} days ago`;
}

function slots(outcomes: OutcomeDTO[]): (OutcomeDTO | null)[] {
  const result: (OutcomeDTO | null)[] = Array.from({ length: MAX_OUTCOMES_PER_GOAL }, () => null);
  const extra: OutcomeDTO[] = [];
  for (const o of outcomes) {
    if (o.position !== null && o.position >= 0 && o.position < MAX_OUTCOMES_PER_GOAL && !result[o.position]) {
      result[o.position] = o;
    } else extra.push(o);
  }
  for (const o of extra) {
    const i = result.findIndex((r) => r === null);
    if (i >= 0) result[i] = o;
  }
  return result;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function GoalOverview({ goal, today, activateGoal, onActivated }: GoalOverviewProps) {
  const rows = slots(goal.outcomes);
  const filledAreas = goal.outcomes.length;
  const activeActions = goal.outcomes.flatMap((o) => o.actions.filter((a) => a.archivedAt === null));
  const filledPositions = filledAreas + activeActions.length;
  const tasks = activeActions.filter((a) => a.kind === 'task');
  const tasksDone = tasks.filter((a) => a.completedAt !== null).length;
  const measured = goal.outcomes.filter((o) => o.measure !== null);
  const purposes = PURPOSE_FIELDS.filter((f) => goal.purpose[f.key].trim());
  const vision = goal.vision.trim();

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={goal.status}>{STATUS_LABEL[goal.status]}</Badge>
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
            <dd className="text-ink tabular-nums">{filledPositions} of {TOTAL_POSITIONS} positions filled</dd>
          </div>
          <div className="py-3">
            <dt className="text-sm text-ink-muted">Actions</dt>
            <dd className="text-ink tabular-nums">
              {tasksDone} of {tasks.length} tasks done
              <span className="block text-sm text-ink-muted">Routines are not counted here.</span>
            </dd>
          </div>
          <div className="py-3">
            <dt className="text-sm text-ink-muted">Goal attainment</dt>
            <dd className="text-ink">
              {measured.length === 0 ? (
                <>
                  Not measured yet
                  <span className="block text-sm text-ink-muted">
                    Add a measure to a key area to track real results.
                  </span>
                </>
              ) : (
                <ul className="space-y-1">
                  {measured.map((o) => (
                    <li key={o.id} className="tabular-nums">
                      {o.title}: {fmtNum(o.measure!.current)} / {fmtNum(o.measure!.target)}
                      {o.measure!.unit ? ` ${o.measure!.unit}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {vision && (
        <section aria-labelledby="g-success" className="space-y-2">
          <h2 id="g-success" className="font-serif text-xl text-ink">Success looks like</h2>
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
