'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { NextItemDTO, TodayDTO } from '@/application/dto';
import type { ExecutionMutations } from '@/ui/actions';
import { routes } from '@/ui/routes';
import { describeSchedule, formatLocalDate, relativeDay } from '@/ui/format';
import { ButtonLink, CheckCircle, EmptyState, ProgressBar } from '@/ui/primitives';
import { ActiveGoalsPanel } from './ActiveGoalsPanel';

export interface TodayViewProps {
  data: TodayDTO;
  mutations: ExecutionMutations;
  onError?: (message: string) => void;
  /** outcomeId -> slot position (0..7); used to deep-link rows to the key area. */
  outcomePositions?: Record<string, number>;
}

/** Stable overdue-first ordering. */
function overdueFirst(items: NextItemDTO[]): NextItemDTO[] {
  return [...items.filter((i) => i.overdue), ...items.filter((i) => !i.overdue)];
}

export function TodayView({ data, mutations, onError, outcomePositions }: TodayViewProps) {
  const [next, setNext] = React.useState<NextItemDTO[]>(() => overdueFirst(data.next));
  const [done, setDone] = React.useState<NextItemDTO[]>(data.doneToday);
  const [pending, setPending] = React.useState<ReadonlySet<string>>(new Set());
  const pendingRef = React.useRef(new Set<string>());
  const [doneOpen, setDoneOpen] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Re-sync when fresh server data arrives (e.g. after revalidation). If a toggle is in flight,
  // defer the sync until it settles rather than dropping it (`pending` is a dependency).
  const lastData = React.useRef(data);
  React.useEffect(() => {
    if (lastData.current === data) return;
    if (pendingRef.current.size > 0) return;
    lastData.current = data;
    setNext(overdueFirst(data.next));
    setDone(data.doneToday);
  }, [data, pending]);

  const toggle = React.useCallback(
    async (item: NextItemDTO, complete: boolean) => {
      const id = item.action.id;
      if (pendingRef.current.has(id)) return;
      setErrorMsg(null);
      pendingRef.current.add(id);
      setPending(new Set(pendingRef.current));

      const from = complete ? next : done;
      const fromIndex = from.findIndex((i) => i.action.id === id);
      const moved: NextItemDTO = {
        ...item,
        action: item.action.kind === 'routine' ? { ...item.action, checkedToday: complete } : item.action,
      };
      // Optimistic move.
      if (complete) {
        setNext((l) => l.filter((i) => i.action.id !== id));
        setDone((l) => [moved, ...l]);
      } else {
        setDone((l) => l.filter((i) => i.action.id !== id));
        setNext((l) => overdueFirst([moved, ...l]));
      }

      const routine = item.action.kind === 'routine';
      let failure: string | null = null;
      let updated: NextItemDTO['action'] | null = null;
      try {
        const res = routine
          ? await (complete ? mutations.checkRoutine : mutations.uncheckRoutine)({ actionId: id, date: data.today })
          : await (complete ? mutations.completeAction : mutations.reopenAction)({ actionId: id });
        if (res.ok) updated = res.data;
        else failure = res.error.message;
      } catch {
        failure = 'Something went wrong. Please try again.';
      }

      if (failure === null) {
        const patch = (l: NextItemDTO[]) =>
          l.map((i) => (i.action.id === id && updated ? { ...i, action: updated } : i));
        if (complete) setDone(patch);
        else setNext(patch);
      } else {
        // Exact rollback: remove from destination, restore at the original index.
        const restore = (l: NextItemDTO[]) => {
          const copy = l.slice();
          copy.splice(Math.min(Math.max(fromIndex, 0), copy.length), 0, item);
          return copy;
        };
        if (complete) {
          setDone((l) => l.filter((i) => i.action.id !== id));
          setNext(restore);
        } else {
          setNext((l) => l.filter((i) => i.action.id !== id));
          setDone(restore);
        }
        setErrorMsg(failure);
        onError?.(failure);
      }
      pendingRef.current.delete(id);
      setPending(new Set(pendingRef.current));
    },
    [next, done, mutations, data.today, onError],
  );

  const total = next.length + done.length;
  const progress = total === 0 ? null : done.length / total;
  const hasRows = total > 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        <header className="space-y-3">
          <h1 className="font-serif text-2xl font-semibold text-ink sm:text-3xl">
            {formatLocalDate(data.today, 'long')}
          </h1>
          {hasRows && (
            <div className="space-y-2">
              <p className="text-sm text-ink-muted" aria-live="polite">
                {done.length} of {total} done today
              </p>
              <ProgressBar progress={progress} label="Done today" />
            </div>
          )}
        </header>

        {errorMsg && (
          <p role="alert" className="text-sm text-danger">
            {errorMsg}
          </p>
        )}

        {!hasRows && <TodayEmpty data={data} />}

        {next.length > 0 && (
          <section aria-labelledby="next-up-heading" className="space-y-2">
            <h2 id="next-up-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Next up
            </h2>
            <ul className="divide-y divide-rule rounded-[var(--radius-md)] border border-rule bg-surface">
              {next.map((item) => (
                <Row
                  key={item.action.id}
                  item={item}
                  today={data.today}
                  checked={false}
                  pending={pending.has(item.action.id)}
                  outcomePositions={outcomePositions}
                  onToggle={() => void toggle(item, true)}
                />
              ))}
            </ul>
          </section>
        )}

        {next.length === 0 && done.length > 0 && (
          <p className="text-sm text-ink-muted">Nothing left for today. Nicely done.</p>
        )}

        {done.length > 0 && (
          <section aria-labelledby="done-heading" className="space-y-2">
            <h2 id="done-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              <button
                type="button"
                aria-expanded={doneOpen}
                aria-controls="done-list"
                onClick={() => setDoneOpen((o) => !o)}
                className="flex min-h-[44px] items-center gap-1 uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {doneOpen ? (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                )}
                Done today ({done.length})
              </button>
            </h2>
            {doneOpen && (
              <ul
                id="done-list"
                className="divide-y divide-rule rounded-[var(--radius-md)] border border-rule bg-surface"
              >
                {done.map((item) => (
                  <Row
                    key={item.action.id}
                    item={item}
                    today={data.today}
                    checked
                    pending={pending.has(item.action.id)}
                    outcomePositions={outcomePositions}
                    onToggle={() => void toggle(item, false)}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <aside aria-label="Active goals" className="min-w-0">
        <ActiveGoalsPanel goals={data.goals} />
      </aside>
    </div>
  );
}

function TodayEmpty({ data }: { data: TodayDTO }) {
  if (!data.hasAnyGoals) {
    return (
      <EmptyState
        title="Set your first goal"
        description="Name one thing you want, break it into key areas, and the actions for today will show up here."
        action={<ButtonLink href={routes.goalNew}>Set your first goal</ButtonLink>}
      />
    );
  }
  if (data.goals.length === 0 && data.draftGoals.length > 0) {
    const draft = data.draftGoals[0]!;
    return (
      <EmptyState
        title="Activate a goal to begin"
        description={`"${draft.title}" is still a draft. Activate it and today's actions will appear here.`}
        action={<ButtonLink href={routes.goal(draft.id)}>Open goal</ButtonLink>}
      />
    );
  }
  const goalId = data.goals[0]?.id;
  return (
    <EmptyState
      title="Nothing due today"
      description="You are clear for now. Pick a few actions from your matrix to work on next."
      action={
        <ButtonLink href={routes.matrix(goalId)} variant="secondary">
          Open the matrix
        </ButtonLink>
      }
    />
  );
}

interface RowProps {
  item: NextItemDTO;
  today: string;
  checked: boolean;
  pending: boolean;
  outcomePositions?: Record<string, number>;
  onToggle: () => void;
}

function Row({ item, today, checked, pending, outcomePositions, onToggle }: RowProps) {
  const { action } = item;
  const routine = action.kind === 'routine';
  const position = outcomePositions?.[item.outcomeId];
  const href = position === undefined ? routes.matrix(item.goalId) : routes.keyArea(item.goalId, position);
  return (
    <li className="flex items-start gap-1 px-1 py-1 motion-safe:animate-[fadein_160ms_ease-out]">
      <CheckCircle
        checked={checked}
        kind={routine ? 'routine' : 'task'}
        label={checked ? `Reopen: ${action.title}` : `Complete: ${action.title}`}
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={onToggle}
      />
      <Link
        href={href}
        className="min-w-0 flex-1 rounded-[var(--radius-sm)] py-2 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span
          className={`block break-words text-base ${checked ? 'text-ink-muted line-through' : 'text-ink'}`}
        >
          {action.title}
        </span>
        <span className="mt-0.5 block truncate text-sm text-ink-muted">
          {item.goalTitle} · {item.outcomeTitle}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {item.overdue && !checked && <span className="font-semibold text-danger">Overdue</span>}
          {action.dueDate && !routine && (
            <span className="text-ink-muted">Due {relativeDay(action.dueDate, today)}</span>
          )}
          {routine && (
            <span className="text-ink-muted">
              <span aria-hidden="true">↻</span> {describeSchedule(action.schedule) || 'Routine'}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
