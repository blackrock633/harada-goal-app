import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { errorMessage } from '@/data/errors';
import type { ExecutionMutations, FocusMutations, MatrixMutations } from '@/data/mutations';
import { MIN_TOUCH, useTheme } from '@/theme';
import { Button, CheckCircle, IconButton, Text } from '@/ui';
import type { ActionDTO, GoalDetailDTO, OutcomeFieldsDTO } from '@shared/application/dto';

import { ActionEditorSheet, type ActionEditorMode } from './ActionEditorSheet';
import { KeyAreaEditor } from './KeyAreaEditor';
import { describeSchedule, formatShortDate, relativeDay } from './format';
import { AREA_COUNT, SLOT_COUNT, buildMatrix, doneLabel } from '@shared/application/matrix';

export interface KeyAreaViewProps {
  goal: GoalDetailDTO;
  /** Key area position 0..7 (out-of-range values are wrapped). */
  position: number;
  /** Today's LocalDate (YYYY-MM-DD) in the user's time zone. */
  today: string;
  matrix: MatrixMutations;
  execution: ExecutionMutations;
  focus: FocusMutations;
  /** Prev/next key area (wraps 0..7). The route layer navigates. */
  onNavigate: (position: number) => void;
  /** Called with a user-facing message when an optimistic change was rolled back. */
  onError: (message: string) => void;
  /** Called after any successful mutation so the route can refresh. */
  onChanged?: () => void;
  /** Offered on CONFLICT. */
  onReloadLatest?: () => void;
}

type OutcomePatch = Pick<OutcomeFieldsDTO, 'id' | 'title' | 'description' | 'updatedAt'>;

const wrap = (n: number) => ((Math.trunc(n) % AREA_COUNT) + AREA_COUNT) % AREA_COUNT;

export function KeyAreaView({
  goal,
  position,
  today,
  matrix,
  execution,
  focus,
  onNavigate,
  onError,
  onChanged,
  onReloadLatest,
}: KeyAreaViewProps) {
  const { colors, radius, space } = useTheme();
  const pos = wrap(Number.isFinite(position) ? position : 0);
  const model = useMemo(() => buildMatrix(goal), [goal]);
  const area = model.areas[pos]!;
  const outcome = area.outcome;

  const [overrides, setOverrides] = useState<Record<string, ActionDTO>>({});
  const [outcomeOverride, setOutcomeOverride] = useState<OutcomePatch | null>(null);
  const inFlight = useRef(new Set<string>());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [areaDirty, setAreaDirty] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [pendingNav, setPendingNav] = useState<number | null>(null);
  const [sheet, setSheet] = useState<{ id: number; mode: ActionEditorMode } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetCounter = useRef(0);

  // Server data is authoritative once the route re-renders with a fresh goal.
  useEffect(() => {
    setOverrides({});
    setOutcomeOverride(null);
  }, [goal]);

  // A different key area is a different draft.
  useEffect(() => {
    setEditorOpen(false);
    setPendingNav(null);
    setSheetOpen(false);
  }, [pos]);

  const effective = (a: ActionDTO) => overrides[a.id] ?? a;

  function markBusy(id: string, on: boolean) {
    if (on) inFlight.current.add(id);
    else inFlight.current.delete(id);
    setBusy(new Set(inFlight.current));
  }

  /** Optimistic update with exact rollback to the previous override (or the server value). */
  async function optimistic(
    original: ActionDTO,
    next: (a: ActionDTO) => ActionDTO,
    run: (a: ActionDTO) => Promise<{ ok: true; data: ActionDTO } | { ok: false; error: Parameters<typeof errorMessage>[0] }>,
    failure: string,
  ) {
    const a = effective(original);
    if (inFlight.current.has(a.id)) return;
    const prev = overrides[a.id];
    const restore = () =>
      setOverrides((o) => {
        const n = { ...o };
        if (prev) n[a.id] = prev;
        else delete n[a.id];
        return n;
      });
    markBusy(a.id, true);
    setOverrides((o) => ({ ...o, [a.id]: next(a) }));
    try {
      const res = await run(a);
      if (res.ok) {
        setOverrides((o) => ({ ...o, [a.id]: res.data }));
        onChanged?.();
      } else {
        restore();
        onError(errorMessage(res.error));
      }
    } catch {
      restore();
      onError(failure);
    } finally {
      markBusy(a.id, false);
    }
  }

  function toggle(original: ActionDTO) {
    const a = effective(original);
    if (a.kind === 'task') {
      const done = !!a.completedAt;
      void optimistic(
        original,
        (x) => ({ ...x, completedAt: done ? null : new Date().toISOString() }),
        (x) => (done ? execution.reopenAction({ actionId: x.id }) : execution.completeAction({ actionId: x.id })),
        'Could not update the action. Check your connection and try again.',
      );
    } else {
      if (!a.dueToday) return;
      const checked = a.checkedToday;
      void optimistic(
        original,
        (x) => ({ ...x, checkedToday: !checked }),
        (x) =>
          checked
            ? execution.uncheckRoutine({ actionId: x.id, date: today })
            : execution.checkRoutine({ actionId: x.id, date: today }),
        'Could not update the action. Check your connection and try again.',
      );
    }
  }

  function toggleFocus(original: ActionDTO) {
    const on = effective(original).focusedToday;
    void optimistic(
      original,
      (x) => ({ ...x, focusedToday: !on }),
      (x) => (on ? focus.removeFromToday({ actionId: x.id }) : focus.addToToday({ actionId: x.id })),
      "Could not update today's list. Check your connection and try again.",
    );
  }

  function openSheet(mode: ActionEditorMode) {
    sheetCounter.current += 1;
    setSheet({ id: sheetCounter.current, mode });
    setSheetOpen(true);
  }

  function navigate(target: number) {
    if (areaDirty) setPendingNav(target);
    else onNavigate(target);
  }

  const canFocus = goal.status !== 'achieved' && goal.status !== 'archived';
  const prevPos = wrap(pos - 1);
  const nextPos = wrap(pos + 1);
  const title = outcomeOverride?.title ?? outcome?.title ?? '';
  const description = outcomeOverride?.description ?? outcome?.description ?? '';

  return (
    <View style={{ gap: space[4], minWidth: 0 }}>
      <View accessibilityRole="toolbar" accessibilityLabel="Key area navigation" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
        <Button title="‹ Prev" variant="ghost" accessibilityLabel={`Previous key area (${prevPos + 1})`} onPress={() => navigate(prevPos)} />
        <Text variant="meta" tone="muted" style={{ fontFamily: 'Inter_600SemiBold' }}>
          {`Key area ${pos + 1} of ${AREA_COUNT}`}
        </Text>
        <Button title="Next ›" variant="ghost" accessibilityLabel={`Next key area (${nextPos + 1})`} onPress={() => navigate(nextPos)} />
      </View>

      {pendingNav !== null ? (
        <View
          accessibilityRole="alert"
          style={{ borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm, padding: space[3], gap: space[2] }}
        >
          <Text variant="meta">You have unsaved changes to this key area. Save them, or discard them to move on.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            <Button
              title="Discard changes"
              variant="secondary"
              onPress={() => {
                const target = pendingNav;
                setResetKey((k) => k + 1);
                setEditorOpen(false);
                setAreaDirty(false);
                setPendingNav(null);
                onNavigate(target);
              }}
            />
            <Button
              title="Keep editing"
              variant="ghost"
              onPress={() => {
                setPendingNav(null);
                setEditorOpen(true);
              }}
            />
          </View>
        </View>
      ) : null}

      {!outcome ? (
        <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.ruleStrong, borderRadius: radius.md, padding: space[4], gap: space[3] }}>
          <Text variant="heading">{`Key area ${pos + 1} is empty`}</Text>
          <Text variant="meta" tone="muted">
            Name one outcome that moves the goal forward. You can fill the other key areas later.
          </Text>
          <Button title={`Add key area ${pos + 1}`} onPress={() => setEditorOpen(true)} />
        </View>
      ) : (
        <>
          <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: space[3], flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}>
            <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
              <Text variant="heading" accessibilityRole="header" style={{ flexShrink: 1 }}>
                {title}
              </Text>
              {description ? (
                <Text variant="meta" tone="muted" style={{ flexShrink: 1 }}>
                  {description}
                </Text>
              ) : null}
              <Text variant="meta" tone="muted">
                {`${area.actionCount} of ${SLOT_COUNT} action slots planned · ${doneLabel(area.doneCount, area.actionCount)}`}
              </Text>
              {outcome.measure ? (
                <Text variant="meta" tone="muted">
                  {`Measure: ${outcome.measure.current} / ${outcome.measure.target} ${outcome.measure.unit}`}
                </Text>
              ) : null}
            </View>
            <IconButton accessibilityLabel="Edit key area" onPress={() => setEditorOpen(true)} icon={<Text variant="body">✎</Text>} />
          </View>

          {areaDirty && !editorOpen && pendingNav === null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Text variant="meta" tone="warning" style={{ flex: 1 }}>
                Unsaved changes to this key area
              </Text>
              <Button title="Continue editing" variant="secondary" onPress={() => setEditorOpen(true)} />
            </View>
          ) : null}

          <View accessibilityLabel={`Actions in key area ${pos + 1}`} style={{ gap: space[2] }}>
            {area.slots.map((slot) => {
              const act = slot.action ? effective(slot.action) : null;
              const testID = `slot-${pos}-${slot.position}`;
              if (!act) {
                return (
                  <Button
                    key={slot.position}
                    testID={testID}
                    title={`${slot.position + 1}. Add action`}
                    accessibilityLabel={`Add action ${slot.position + 1} of ${SLOT_COUNT}`}
                    variant="secondary"
                    onPress={() =>
                      openSheet({
                        type: 'add',
                        outcomeId: outcome.id,
                        position: slot.position,
                        heading: `${title}: action ${slot.position + 1} of ${SLOT_COUNT}`,
                      })
                    }
                  />
                );
              }
              const done = act.kind === 'task' && !!act.completedAt;
              const checked = act.kind === 'task' ? done : act.checkedToday;
              const isBusy = busy.has(act.id);
              const disabled = act.kind === 'routine' && !act.dueToday;
              return (
                <View
                  key={slot.position}
                  testID={testID}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    minWidth: 0,
                    borderWidth: 1,
                    borderColor: colors.rule,
                    borderRadius: radius.sm,
                    backgroundColor: colors.surface,
                  }}
                >
                  <CheckCircle
                    checked={checked}
                    accessibilityLabel={`${checked ? 'Reopen' : 'Complete'}: ${act.title}`}
                    busy={isBusy}
                    disabled={disabled}
                    onPress={() => toggle(slot.action!)}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit action ${slot.position + 1} of ${SLOT_COUNT}: ${act.title}`}
                    onPress={() => openSheet({ type: 'edit', action: act })}
                    style={{ flex: 1, minWidth: 0, minHeight: MIN_TOUCH, justifyContent: 'center', paddingVertical: space[1], paddingRight: space[2] }}
                  >
                    <Text
                      variant="meta"
                      numberOfLines={2}
                      style={{ fontFamily: 'Inter_500Medium', flexShrink: 1, textDecorationLine: done ? 'line-through' : 'none' }}
                      tone={done ? 'muted' : 'default'}
                    >
                      {`${act.kind === 'routine' ? '↻ ' : ''}${act.title}`}
                    </Text>
                    {isBusy ? (
                      <Text variant="meta" accessibilityRole="text" accessibilityLiveRegion="polite" style={{ fontFamily: 'Inter_600SemiBold' }}>
                        Saving…
                      </Text>
                    ) : (
                      <Text variant="meta" tone="muted" style={{ flexShrink: 1 }}>
                        {statusText(act, today)}
                      </Text>
                    )}
                  </Pressable>
                  {canFocus && !act.archivedAt ? (
                    <Pressable
                      accessibilityRole="switch"
                      accessibilityLabel={`Add to today: ${act.title}`}
                      accessibilityState={{ checked: act.focusedToday, busy: isBusy, disabled: isBusy }}
                      disabled={isBusy}
                      onPress={() => toggleFocus(slot.action!)}
                      style={{
                        minWidth: MIN_TOUCH,
                        minHeight: MIN_TOUCH,
                        marginRight: space[1],
                        paddingHorizontal: space[2],
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: radius.sm,
                        backgroundColor: act.focusedToday ? colors.accentSoft : 'transparent',
                        opacity: isBusy ? 0.6 : 1,
                      }}
                    >
                      <Text variant="meta" tone={act.focusedToday ? 'default' : 'muted'} style={{ fontFamily: 'Inter_500Medium', textAlign: 'center' }}>
                        {act.focusedToday ? 'On today' : 'Add to today'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      )}

      <KeyAreaEditor
        key={`${resetKey}:${outcome ? 'edit' : 'create'}:${pos}`}
        mode={
          outcome
            ? {
                type: 'edit',
                outcome: {
                  id: outcome.id,
                  title,
                  description,
                  updatedAt: outcomeOverride?.updatedAt ?? outcome.updatedAt,
                },
              }
            : { type: 'create', goalId: goal.id, position: pos }
        }
        visible={editorOpen}
        onClose={() => setEditorOpen(false)}
        mutations={matrix}
        onDirtyChange={setAreaDirty}
        onReloadLatest={onReloadLatest}
        onDone={(o) => {
          if (outcome) setOutcomeOverride({ id: o.id, title: o.title, description: o.description, updatedAt: o.updatedAt });
          onChanged?.();
        }}
      />

      {sheet ? (
        <ActionEditorSheet
          key={sheet.id}
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          mode={sheet.mode}
          mutations={matrix}
          onReloadLatest={onReloadLatest}
          onSaved={(saved) => {
            // Keep the fresh updatedAt so a second edit before the refresh isn't stale.
            if (sheet.mode.type === 'edit' && saved?.id) setOverrides((o) => ({ ...o, [saved.id]: saved }));
            onChanged?.();
          }}
        />
      ) : null}
    </View>
  );
}

function statusText(a: ActionDTO, today: string): string {
  if (a.kind === 'task') {
    if (a.completedAt) return 'Done';
    if (a.dueDate) return a.dueDate < today ? `Overdue · ${formatShortDate(a.dueDate)}` : `Due ${relativeDay(a.dueDate, today)}`;
    return 'Open task';
  }
  const sched = describeSchedule(a.schedule) || 'Routine';
  if (a.checkedToday) return `${sched} · Checked today`;
  return a.dueToday ? `${sched} · Due today` : sched;
}
