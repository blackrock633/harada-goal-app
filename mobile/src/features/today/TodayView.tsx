import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { ActionDTO, NextItemDTO, TodayDTO } from '@shared/application/dto';
import type { AppError } from '@shared/application/result';
import { MAX_DAILY_FOCUS } from '@shared/domain/limits';
import { useTheme } from '@/theme';
import { CheckCircle, EmptyState, IconButton, Screen, Text } from '@/ui';
import { errorMessage } from '@/data/errors';
import type { ExecutionMutations, FocusMutations } from '@/data/mutations';
import { ActiveGoalsPanel } from './ActiveGoalsPanel';
import { describeSchedule, formatLocalDate, relativeDay } from './format';

export type TodayViewProps = {
  data: TodayDTO;
  mutations: ExecutionMutations;
  focusMutations: FocusMutations;
  onError?: (message: string) => void;
  /** Row body press: open the key area that owns the action. */
  onOpenAction?: (goalId: string, outcomePosition: number) => void;
  onOpenGoal?: (goalId: string) => void;
  /** Empty state: no goals at all. */
  onCreateGoal?: () => void;
  /** Empty state: nothing due; opens the matrix of the given (first active) goal. */
  onOpenMatrix?: (goalId: string) => void;
};

type ListKey = 'focus' | 'next' | 'done';
type Lists = Record<ListKey, NextItemDTO[]>;

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

type CallResult = { ok: true; data: ActionDTO } | { ok: false; error: AppError };
interface Change {
  item: NextItemDTO;
  from: ListKey;
  to: ListKey;
  /** The optimistic version of the item. */
  next: NextItemDTO;
  call: () => Promise<CallResult>;
}

export function TodayView({
  data,
  mutations,
  focusMutations,
  onError,
  onOpenAction,
  onOpenGoal,
  onCreateGoal,
  onOpenMatrix,
}: TodayViewProps) {
  const { space } = useTheme();
  const [lists, setLists] = useState<Lists>(() => fromData(data));
  const listsRef = useRef(lists);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const pendingRef = useRef(new Set<string>());
  const [doneOpen, setDoneOpen] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const apply = useCallback((fn: (l: Lists) => Lists) => {
    listsRef.current = fn(listsRef.current);
    setLists(listsRef.current);
  }, []);

  // Re-sync when fresh server data arrives. If a mutation is in flight, defer until it settles
  // (`pending` is a dependency) rather than dropping the new data.
  const lastData = useRef(data);
  useEffect(() => {
    if (lastData.current === data) return;
    if (pendingRef.current.size > 0) return;
    lastData.current = data;
    apply(() => fromData(data));
  }, [data, pending, apply]);

  // One in-flight mutation per action, shared by completion, add and remove.
  const run = useCallback(
    async ({ item, from, to, next, call }: Change) => {
      const id = item.action.id;
      if (pendingRef.current.has(id)) return;
      setErrorMsg(null);
      pendingRef.current.add(id);
      setPending(new Set(pendingRef.current));

      const fromIndex = listsRef.current[from].findIndex((i) => i.action.id === id);
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
      next: from === 'focus' || routine ? next : item,
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
  const hasRows = total > 0;
  const full = focus.length >= MAX_DAILY_FOCUS;
  const allFocusDone = focus.every((i) => isDone(i.action));

  return (
    <Screen>
      <View style={{ gap: space[1] }}>
        <Text variant="title">{formatLocalDate(data.today, 'long')}</Text>
        {hasRows ? (
          <Text variant="body" tone="muted" accessibilityLiveRegion="polite">
            {`${doneCount} of ${total} done today`}
          </Text>
        ) : null}
      </View>

      {errorMsg ? (
        <Text variant="body" tone="danger" accessibilityRole="alert">
          {errorMsg}
        </Text>
      ) : null}

      {!hasRows ? (
        <TodayEmpty data={data} onCreateGoal={onCreateGoal} onOpenGoal={onOpenGoal} onOpenMatrix={onOpenMatrix} />
      ) : null}

      {focus.length > 0 || next.length > 0 ? (
        <View style={{ gap: space[2] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <SectionTitle>Today&apos;s focus</SectionTitle>
            <Text variant="meta" tone="muted">{`${focus.length} of ${MAX_DAILY_FOCUS} picked`}</Text>
          </View>
          {focus.length > 0 ? (
            <Card>
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
                    onOpen={onOpenAction}
                    trailing={
                      <IconButton
                        accessibilityLabel={`Remove from today: ${item.action.title}`}
                        disabled={busy}
                        onPress={() => removeFromToday(item)}
                        icon={<Text variant="body">✕</Text>}
                      />
                    }
                  />
                );
              })}
            </Card>
          ) : (
            <Text variant="meta" tone="muted">
              {`Nothing picked yet. Add up to ${MAX_DAILY_FOCUS} actions from Next up.`}
            </Text>
          )}
          {full ? (
            <Text variant="meta" tone="muted">
              {`You have picked ${MAX_DAILY_FOCUS} of ${MAX_DAILY_FOCUS}. Remove one to add another.`}
            </Text>
          ) : null}
        </View>
      ) : null}

      {next.length > 0 ? (
        <View style={{ gap: space[2] }}>
          <SectionTitle>Next up</SectionTitle>
          <Card>
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
                  onOpen={onOpenAction}
                  trailing={
                    <IconButton
                      accessibilityLabel={`Add to today: ${item.action.title}`}
                      disabled={busy || full}
                      onPress={() => addToToday(item)}
                      icon={<Text variant="body">＋</Text>}
                    />
                  }
                />
              );
            })}
          </Card>
        </View>
      ) : null}

      {next.length === 0 && total > 0 && allFocusDone ? (
        <Text variant="meta" tone="muted">
          Nothing left for today. Nicely done.
        </Text>
      ) : null}

      {done.length > 0 ? (
        <View style={{ gap: space[2] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Done today (${done.length})`}
            accessibilityState={{ expanded: doneOpen }}
            onPress={() => setDoneOpen((o) => !o)}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space[1] }}
          >
            <Text variant="meta" tone="muted" style={{ fontFamily: 'Inter_600SemiBold' }}>
              {doneOpen ? '▾' : '▸'}
            </Text>
            <SectionTitle>{`Done today (${done.length})`}</SectionTitle>
          </Pressable>
          {doneOpen ? (
            <Card>
              {done.map((item) => (
                <Row
                  key={item.action.id}
                  item={item}
                  today={data.today}
                  checked
                  pending={pending.has(item.action.id)}
                  onToggle={() => toggle(item, 'done', false)}
                  onOpen={onOpenAction}
                />
              ))}
            </Card>
          ) : null}
        </View>
      ) : null}

      <ActiveGoalsPanel goals={data.goals} onOpenGoal={onOpenGoal} />
    </Screen>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="meta" tone="muted" accessibilityRole="header" style={{ fontFamily: 'Inter_600SemiBold' }}>
      {children}
    </Text>
  );
}

function Card({ children }: { children: ReactNode }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.rule,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

function TodayEmpty({
  data,
  onCreateGoal,
  onOpenGoal,
  onOpenMatrix,
}: {
  data: TodayDTO;
  onCreateGoal?: () => void;
  onOpenGoal?: (goalId: string) => void;
  onOpenMatrix?: (goalId: string) => void;
}) {
  if (!data.hasAnyGoals) {
    return (
      <EmptyState
        title="Set your first goal"
        message="Name one thing you want, break it into key areas, and the actions for today will show up here."
        action={onCreateGoal ? { label: 'Set your first goal', onPress: onCreateGoal } : undefined}
      />
    );
  }
  if (data.goals.length === 0 && data.draftGoals.length > 0) {
    const draft = data.draftGoals[0]!;
    return (
      <EmptyState
        title="Activate a goal to begin"
        message={`"${draft.title}" is still a draft. Activate it and today's actions will appear here.`}
        action={onOpenGoal ? { label: 'Open goal', onPress: () => onOpenGoal(draft.id) } : undefined}
      />
    );
  }
  const goalId = data.goals[0]?.id;
  const open = onOpenMatrix && goalId ? () => onOpenMatrix(goalId) : undefined;
  const action = open ? { label: 'Open the matrix', onPress: open } : undefined;
  if (data.goals.length > 0) {
    return (
      <EmptyState
        title="A clear day"
        message="Nothing scheduled today. Pick up to 5 actions from your matrix to focus on."
        action={action}
      />
    );
  }
  return (
    <EmptyState
      title="Nothing due today"
      message="You are clear for now. Pick a few actions from your matrix to work on next."
      action={action}
    />
  );
}

type RowProps = {
  item: NextItemDTO;
  today: string;
  checked: boolean;
  pending: boolean;
  onToggle: () => void;
  onOpen?: (goalId: string, outcomePosition: number) => void;
  trailing?: ReactNode;
};

function Row({ item, today, checked, pending, onToggle, onOpen, trailing }: RowProps) {
  const { colors, space } = useTheme();
  const { action } = item;
  const routine = action.kind === 'routine';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        borderBottomWidth: 1,
        borderBottomColor: colors.rule,
        paddingHorizontal: space[1],
      }}
    >
      <CheckCircle
        checked={checked}
        accessibilityLabel={checked ? `Reopen: ${action.title}` : `Complete: ${action.title}`}
        busy={pending}
        onPress={onToggle}
      />
      <Pressable
        accessibilityRole="link"
        accessibilityState={{ busy: pending, disabled: !onOpen }}
        disabled={!onOpen}
        onPress={() => onOpen?.(item.goalId, item.outcomePosition)}
        style={{ flex: 1, minWidth: 0, paddingVertical: space[2], paddingRight: space[2] }}
      >
        <Text
          variant="body"
          tone={checked ? 'muted' : 'default'}
          style={checked ? { textDecorationLine: 'line-through' } : undefined}
        >
          {action.title}
        </Text>
        <Text variant="meta" tone="muted" numberOfLines={1}>
          {`${item.goalTitle} · ${item.outcomeTitle}`}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space[3], marginTop: 2 }}>
          {pending ? (
            <Text variant="meta" accessibilityLiveRegion="polite" style={{ fontFamily: 'Inter_500Medium' }}>
              Saving…
            </Text>
          ) : null}
          {item.overdue && !checked ? (
            <Text variant="meta" tone="danger" style={{ fontFamily: 'Inter_600SemiBold' }}>
              Overdue
            </Text>
          ) : null}
          {action.dueDate && !routine ? (
            <Text variant="meta" tone="muted">{`Due ${relativeDay(action.dueDate, today)}`}</Text>
          ) : null}
          {routine ? (
            <Text variant="meta" tone="muted">{`↻ ${describeSchedule(action.schedule) || 'Routine'}`}</Text>
          ) : null}
        </View>
      </Pressable>
      {trailing}
    </View>
  );
}
