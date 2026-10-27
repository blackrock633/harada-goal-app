import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { ActionDTO, NextItemDTO, TodayDTO } from '@shared/application/dto';
import type { AppError } from '@shared/application/result';
import { MAX_DAILY_FOCUS } from '@shared/domain/limits';
import { MIN_TOUCH, useTheme } from '@/theme';
import { Button, CheckCircle, EmptyState, FocusToggle, Icon, ListRow, Screen, Section, Text, useLayout } from '@/ui';
import { errorMessage } from '@/data/errors';
import type { ExecutionMutations, FocusMutations, GoalMutations } from '@/data/mutations';
import { ActivateGoalButton } from '@/features/goal/ActivateGoalButton';
import { ActiveGoalsPanel } from './ActiveGoalsPanel';
import { describeSchedule, formatTodayTitle, relativeDay } from './format';

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
  /** Draft state: the same mutation as the goal screen, so a draft can be activated from Today. */
  activateGoal?: GoalMutations['activateGoal'];
  onActivated?: () => void;
  /** "Reflect on today" link. */
  onOpenReview?: (goalId: string) => void;
  /** A quiet row under the lists (the 30-Day Challenge entry); loads on its own, never blocks Today. */
  challengeEntry?: ReactNode;
};

const TWO_COLUMN_BREAKPOINT = 1024;

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
  activateGoal,
  onActivated,
  onOpenReview,
  challengeEntry,
}: TodayViewProps) {
  const { space } = useTheme();
  const { width } = useLayout();
  const twoColumns = width >= TWO_COLUMN_BREAKPOINT;
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
  const full = focus.length >= MAX_DAILY_FOCUS;
  const multiGoal = data.goals.length > 1;
  // With nothing in focus, the first derived item is offered as "Start here" and not repeated below.
  const suggestion = focus.length === 0 ? next[0] : undefined;
  const rest = suggestion ? next.slice(1) : next;
  const routinesDue = rest.filter((i) => i.action.kind === 'routine');
  const openTasks = rest.filter((i) => i.action.kind !== 'routine');
  const firstGoal = data.goals[0];
  const draft = data.goals.length === 0 ? data.draftGoals[0] : undefined;

  /** `suggest`: the "Start here" row, with a primary Focus button instead of the toggle. */
  const row = (item: NextItemDTO, from: ListKey, suggest = false) => {
    const a = item.action;
    const routine = a.kind === 'routine';
    const checked = from === 'focus' ? isDone(a) : from === 'done';
    const busy = pending.has(a.id);
    const parts: string[] = [];
    if (busy) parts.push('Saving…');
    if (item.overdue && !checked) parts.push('Overdue');
    if (a.dueDate && !routine) parts.push(`Due ${relativeDay(a.dueDate, data.today)}`);
    if (routine) parts.push(describeSchedule(a.schedule) || 'Routine');
    parts.push(multiGoal ? `${item.goalTitle} · ${item.outcomeTitle}` : item.outcomeTitle);
    if (suggest) parts.unshift('Start here');
    return (
      <ListRow
        key={a.id}
        testID={suggest ? 'focus-suggestion' : undefined}
        divider={!suggest}
        title={a.title}
        meta={parts.join(' · ')}
        metaIcon={routine ? 'routine' : undefined}
        done={checked}
        onPress={onOpenAction ? () => onOpenAction(item.goalId, item.outcomePosition) : undefined}
        leading={
          <CheckCircle
            shape={routine ? 'square' : 'circle'}
            checked={checked}
            accessibilityLabel={checked ? `Reopen: ${a.title}` : `Complete: ${a.title}`}
            busy={busy}
            onPress={() => toggle(item, from, from === 'focus' ? !isDone(a) : from === 'next')}
          />
        }
        trailing={
          suggest && width >= 768 ? (
            <Button
              title="Focus on this"
              icon="focus"
              size="compact"
              disabled={busy}
              accessibilityLabel={`Today's focus: ${a.title}`}
              onPress={() => addToToday(item)}
            />
          ) : suggest || from === 'done' ? undefined : (
            <FocusToggle
              on={from === 'focus'}
              actionTitle={a.title}
              display={width >= 768 ? 'label' : 'icon'}
              disabled={busy || (from === 'next' && full)}
              onPress={() => (from === 'focus' ? removeFromToday(item) : addToToday(item))}
            />
          )
        }
      />
    );
  };

  const emptyLine = (text: string, action?: { label: string; onPress: () => void }) => (
    <View style={{ gap: space[1], alignItems: 'flex-start' }}>
      <Text variant="body" tone="muted">
        {text}
      </Text>
      {action ? <Button title={action.label} variant="ghost" onPress={action.onPress} style={{ marginLeft: -space[2] }} /> : null}
    </View>
  );

  const matrixAction =
    onOpenMatrix && firstGoal ? { label: 'Choose from matrix', onPress: () => onOpenMatrix(firstGoal.id) } : undefined;

  const focusSection = (
    <Section
      title="Focus"
      ruled={false}
      action={
        <Text variant="meta" tone="muted" tabular accessibilityLabel={`${focus.length} of ${MAX_DAILY_FOCUS} chosen`}>
          {`${focus.length} of ${MAX_DAILY_FOCUS}`}
        </Text>
      }
    >
      {focus.length > 0 ? (
        <View>{focus.map((i) => row(i, 'focus'))}</View>
      ) : suggestion ? (
        // Nothing chosen yet: name one concrete next step (the first item of the derived list)
        // instead of describing the feature. Any other action can still be picked below.
        <View style={{ gap: space[1] }}>
          {row(suggestion, 'next', true)}
          {width < 768 ? (
            // Phones: the button gets its own line so the row's text keeps its full width.
            <Button
              title="Focus on this"
              icon="focus"
              disabled={pending.has(suggestion.action.id)}
              accessibilityLabel={`Today's focus: ${suggestion.action.title}`}
              onPress={() => addToToday(suggestion)}
              style={{ alignSelf: 'flex-start', marginLeft: MIN_TOUCH + space[2] }}
            />
          ) : null}
        </View>
      ) : (
        emptyLine(`Pick up to ${MAX_DAILY_FOCUS} actions for today from your matrix.`, matrixAction)
      )}
      {full ? (
        <Text variant="meta" tone="muted">
          {`You have picked ${MAX_DAILY_FOCUS} of ${MAX_DAILY_FOCUS}. Remove one to add another.`}
        </Text>
      ) : null}
    </Section>
  );

  const routinesSection = (
    <Section title="Routines due" ruled={!twoColumns}>
      {routinesDue.length > 0 ? <View>{routinesDue.map((i) => row(i, 'next'))}</View> : emptyLine('No routines due today.')}
    </Section>
  );

  const tasksSection = (
    <Section title="Open tasks" ruled={!twoColumns}>
      {openTasks.length > 0 ? <View>{openTasks.map((i) => row(i, 'next'))}</View> : emptyLine('No open tasks.')}
    </Section>
  );

  const doneSection =
    done.length > 0 ? (
      <Section
        title="Done today"
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Done today (${done.length})`}
            accessibilityState={{ expanded: doneOpen }}
            onPress={() => setDoneOpen((o) => !o)}
            style={{ minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: space[1], marginTop: -space[2] }}
          >
            <Text variant="meta" tone="muted" tabular>
              {String(done.length)}
            </Text>
            <Icon name="expand" size={18} style={{ transform: [{ rotate: doneOpen ? '0deg' : '-90deg' }] }} />
          </Pressable>
        }
      >
        {doneOpen ? <View>{done.map((i) => row(i, 'done'))}</View> : null}
      </Section>
    ) : null;

  const reflect =
    firstGoal && onOpenReview ? (
      <View style={{ alignItems: 'flex-start' }}>
        <Button title="Reflect on today" variant="ghost" icon="reflect" onPress={() => onOpenReview(firstGoal.id)} style={{ marginLeft: -space[2] }} />
      </View>
    ) : null;

  const panel = <ActiveGoalsPanel goals={data.goals} onOpenGoal={onOpenGoal} />;

  const goalLine = firstGoal ?? draft;
  const goalLineText = firstGoal
    ? data.goals.length > 1
      ? `${firstGoal.title} and ${data.goals.length - 1} more`
      : firstGoal.title
    : draft?.title;

  const heading = (
    <View style={{ gap: space[1] }}>
      <Text variant="title">{formatTodayTitle(data.today)}</Text>
      {goalLine && goalLineText ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Goal: ${goalLineText}`}
          disabled={!onOpenGoal}
          onPress={() => onOpenGoal?.(goalLine.id)}
          hitSlop={space[2]}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}
        >
          <Text variant="meta" tone="muted" style={{ flexShrink: 1 }}>
            {goalLineText}
          </Text>
          {onOpenGoal ? <Icon name="forward" size={14} /> : null}
        </Pressable>
      ) : null}
    </View>
  );

  const errorBanner = errorMsg ? (
    <Text variant="body" tone="danger" accessibilityRole="alert">
      {errorMsg}
    </Text>
  ) : null;

  if (!data.hasAnyGoals) {
    return (
      <Screen>
        {heading}
        <EmptyState
          title="Start with one goal"
          message="The Harada Method starts with a single goal, broken into key areas and the actions that fill them. Today lists what to do next."
          action={onCreateGoal ? { label: 'Set your goal', onPress: onCreateGoal } : undefined}
        />
      </Screen>
    );
  }

  if (draft) {
    return (
      <Screen>
        {heading}
        <Section title="Activate your goal to begin" ruled={false}>
          <Text variant="body" tone="muted">
            {`"${draft.title}" is still a draft. Today's actions appear once the goal is active.`}
          </Text>
          {activateGoal ? (
            <ActivateGoalButton goalId={draft.id} activateGoal={activateGoal} onActivated={onActivated} note={null} />
          ) : onOpenGoal ? (
            <View style={{ alignItems: 'flex-start' }}>
              <Button title="Open goal" onPress={() => onOpenGoal(draft.id)} />
            </View>
          ) : null}
        </Section>
      </Screen>
    );
  }

  return (
    <Screen maxWidth={twoColumns ? 1040 : undefined}>
      {heading}
      {errorBanner}
      {twoColumns ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[10] }}>
          <View style={{ flex: 1, gap: space[4] }}>
            {focusSection}
            {routinesSection}
            {doneSection}
          </View>
          <View style={{ flex: 1, gap: space[4] }}>
            {tasksSection}
            {reflect}
            {challengeEntry}
            {panel}
          </View>
        </View>
      ) : (
        <>
          {focusSection}
          {routinesSection}
          {tasksSection}
          {doneSection}
          {reflect}
          {challengeEntry}
          {panel}
        </>
      )}
    </Screen>
  );
}
