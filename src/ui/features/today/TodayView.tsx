'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import type { ActionDTO, NextItemDTO, TodayDTO } from '@/application/dto';
import { MAX_DAILY_FOCUS } from '@/domain/limits';
import type { ExecutionMutations, FocusMutations } from '@/ui/actions';
import { routes } from '@/ui/routes';
import { errorMessage } from '@/ui/errors';
import { describeSchedule, formatLocalDate, relativeDay } from '@/ui/format';
import { ButtonLink, CheckCircle, EmptyState, IconButton, ProgressBar } from '@/ui/primitives';
import { ActiveGoalsPanel } from './ActiveGoalsPanel';

export interface TodayViewProps {
  data: TodayDTO;
  mutations: ExecutionMutations;
  focusMutations: FocusMutations;
  onError?: (message: string) => void;
}

type ListKey = 'focus' | 'next' | 'done';
interface Lists {
  focus: NextItemDTO[];
  next: NextItemDTO[];
  done: NextItemDTO[];
}

/** Stable overdue-first ordering. */
function overdueFirst(items: NextItemDTO[]): NextItemDTO[] {
  return [...items.filter((i) => i.overdue), ...items.filter((i) => !i.overdue)];
}

function fromData(data: TodayDTO): Lists {
  return { focus: data.focus, next: overdueFirst(data.next), done: data.doneToday };
}

/** A focus task is done when completed; a focus routine when checked today. */
function isDone(a: ActionDTO): boolean {
  return a.kind === 'routine' ? a.checkedToday : a.completedAt != null;
}

function withDone(a: ActionDTO, done: boolean): ActionDTO {
  return a.kind === 'routine'
    ? { ...a, checkedToday: done }
    : { ...a, completedAt: done ? new Date().toISOString() : null };
}

function insertInto(lists: Lists, key: ListKey, item: NextItemDTO, index?: number): Lists {
  const list = lists[key];
  if (index !== undefined) {
    const copy = list.slice();
    copy.splice(Math.min(Math.max(index, 0), copy.length), 0, item);
    return { ...lists, [key]: copy };
  }
  if (key === 'focus') return { ...lists, focus: [...list, item] };
  if (key === 'next') return { ...lists, next: overdueFirst([item, ...list]) };
  return { ...lists, done: [item, ...list] };
}

function removeFrom(lists: Lists, key: ListKey, id: string): Lists {
  return { ...lists, [key]: lists[key].filter((i) => i.action.id !== id) };
}

interface Change {
  item: NextItemDTO;
  from: ListKey;
  to: ListKey;
  /** The optimistic version of the item. */
  next: NextItemDTO;
  call: () => Promise<
    { ok: true; data: ActionDTO } | { ok: false; error: Parameters<typeof errorMessage>[0] }
  >;
}

export function TodayView({ data, mutations, focusMutations, onError }: TodayViewProps) {
  const [lists, setLists] = React.useState<Lists>(() => fromData(data));
  const listsRef = React.useRef(lists);
  const [pending, setPending] = React.useState<ReadonlySet<string>>(new Set());
  const pendingRef = React.useRef(new Set<string>());
  const [doneOpen, setDoneOpen] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const apply = React.useCallback((fn: (l: Lists) => Lists) => {
    listsRef.current = fn(listsRef.current);
    setLists(listsRef.current);
  }, []);

  // Re-sync when fresh server data arrives (e.g. after revalidation). If a mutation is in flight,
  // defer the sync until it settles rather than dropping it (`pending` is a dependency).
  const lastData = React.useRef(data);
  React.useEffect(() => {
    if (lastData.current === data) return;
    if (pendingRef.current.size > 0) return;
    lastData.current = data;
    apply(() => fromData(data));
  }, [data, pending, apply]);

  // One in-flight mutation per action, shared by completion, add and remove.
  const run = React.useCallback(
    async ({ item, from, to, next, call }: Change) => {
      const id = item.action.id;
      if (pendingRef.current.has(id)) return;
      setErrorMsg(null);
      pendingRef.current.add(id);
      setPending(new Set(pendingRef.current));

      const fromIndex = listsRef.current[from].findIndex((i) => i.action.id === id);
      // Optimistic change: in place, or move between lists.
      if (from === to) {
        apply((l) => ({ ...l, [from]: l[from].map((i) => (i.action.id === id ? next : i)) }));
      } else {
        apply((l) => insertInto(removeFrom(l, from, id), to, next));
      }

      let failure: string | null = null;
      let updated: ActionDTO | null = null;
      try {
        const res = await call();
        if (res.ok) updated = res.data;
        else failure = errorMessage(res.error);
      } catch {
        failure = errorMessage({ code: 'UNAVAILABLE', message: '' });
      }

      if (failure === null) {
        const fresh = updated;
        apply((l) => ({
          ...l,
          [to]: l[to].map((i) => (i.action.id === id && fresh ? { ...i, action: fresh } : i)),
        }));
      } else {
        // Exact rollback: remove from destination, restore the original at its index.
        apply((l) => insertInto(removeFrom(l, to, id), from, item, fromIndex));
        setErrorMsg(failure);
        onError?.(failure);
      }
      pendingRef.current.delete(id);
      setPending(new Set(pendingRef.current));
    },
    [apply, onError],
  );

  const toggle = (item: NextItemDTO, from: ListKey, complete: boolean) => {
    const id = item.action.id;
    const next: NextItemDTO = { ...item, action: withDone(item.action, complete) };
    const to: ListKey = from === 'focus' ? 'focus' : complete ? 'done' : 'next';
    const routine = item.action.kind === 'routine';
    void run({
      item,
      from,
      to,
      next: from === 'focus' ? next : routine ? next : item,
      call: () =>
        routine
          ? (complete ? mutations.checkRoutine : mutations.uncheckRoutine)({ actionId: id, date: data.today })
          : (complete ? mutations.completeAction : mutations.reopenAction)({ actionId: id }),
    });
  };

  const addToToday = (item: NextItemDTO) =>
    void run({
      item,
      from: 'next',
      to: 'focus',
      next: { ...item, action: { ...item.action, focusedToday: true } },
      call: () => focusMutations.addToToday({ actionId: item.action.id, date: data.today }),
    });

  const removeFromToday = (item: NextItemDTO) =>
    void run({
      item,
      from: 'focus',
      to: isDone(item.action) ? 'done' : 'next',
      next: { ...item, action: { ...item.action, focusedToday: false } },
      call: () => focusMutations.removeFromToday({ actionId: item.action.id, date: data.today }),
    });

  const { focus, next, done } = lists;
  const total = focus.length + next.length + done.length;
  const doneCount = focus.filter((i) => isDone(i.action)).length + done.length;
  const progress = total === 0 ? null : doneCount / total;
  const hasRows = total > 0;
  const full = focus.length >= MAX_DAILY_FOCUS;
  const allFocusDone = focus.every((i) => isDone(i.action));

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
                {doneCount} of {total} done today
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

        {(focus.length > 0 || next.length > 0) && (
          <section aria-labelledby="focus-heading" className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 id="focus-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                Today&apos;s focus
              </h2>
              <p className="text-sm text-ink-muted">
                {focus.length} of {MAX_DAILY_FOCUS} picked
              </p>
            </div>
            {focus.length > 0 ? (
              <ul className="divide-y divide-rule rounded-[var(--radius-md)] border border-rule bg-surface">
                {focus.map((item) => {
                  const busy = pending.has(item.action.id);
                  return (
                    <Row
                      key={item.action.id}
                      item={item}
                      today={data.today}
                      checked={isDone(item.action)}
                      pending={busy}
                      onToggle={() => toggle(item, 'focus', !isDone(item.action))}
                      trailing={
                        <IconButton
                          label={`Remove from today: ${item.action.title}`}
                          disabled={busy}
                          onClick={() => removeFromToday(item)}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                      }
                    />
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">
                Nothing picked yet. Add up to {MAX_DAILY_FOCUS} actions from Next up.
              </p>
            )}
            {full && (
              <p id="focus-full" className="text-sm text-ink-muted">
                You have picked {MAX_DAILY_FOCUS} of {MAX_DAILY_FOCUS}. Remove one to add another.
              </p>
            )}
          </section>
        )}

        {next.length > 0 && (
          <section aria-labelledby="next-up-heading" className="space-y-2">
            <h2 id="next-up-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Next up
            </h2>
            <ul className="divide-y divide-rule rounded-[var(--radius-md)] border border-rule bg-surface">
              {next.map((item) => {
                const busy = pending.has(item.action.id);
                return (
                  <Row
                    key={item.action.id}
                    item={item}
                    today={data.today}
                    checked={false}
                    pending={busy}
                    onToggle={() => toggle(item, 'next', true)}
                    trailing={
                      <IconButton
                        label={`Add to today: ${item.action.title}`}
                        disabled={busy || full}
                        aria-describedby={full ? 'focus-full' : undefined}
                        onClick={() => addToToday(item)}
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    }
                  />
                );
              })}
            </ul>
          </section>
        )}

        {next.length === 0 && total > 0 && allFocusDone && (
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
                    onToggle={() => toggle(item, 'done', false)}
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
  if (data.goals.length > 0) {
    return (
      <EmptyState
        title="A clear day"
        description="Nothing scheduled today. Pick up to 5 actions from your matrix to focus on."
        action={
          <ButtonLink href={routes.matrix(goalId)} variant="secondary">
            Open the matrix
          </ButtonLink>
        }
      />
    );
  }
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
  onToggle: () => void;
  trailing?: React.ReactNode;
}

function Row({ item, today, checked, pending, onToggle, trailing }: RowProps) {
  const { action } = item;
  const routine = action.kind === 'routine';
  const href = routes.keyArea(item.goalId, item.outcomePosition);
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
      {trailing}
    </li>
  );
}
