import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { errorMessage, newClientId } from '@/data/errors';
import type { ExecutionMutations, FocusMutations, MatrixMutations } from '@/data/mutations';
import { CONTENT_MAX_WIDTH, useTheme } from '@/theme';
import { Button, CheckCircle, FocusToggle, Icon, IconButton, ListRow, Section, Text, useLayout } from '@/ui';
import type { ActionDTO, GoalDetailDTO, OutcomeFieldsDTO } from '@shared/application/dto';
import type { Result } from '@shared/application/result';
import { LIMITS } from '@shared/domain/limits';

import { PlanSuggestions, type SuggestedAction, type SuggestedArea } from '../premium/PlanSuggestions';

import { ActionEditorSheet, type ActionEditorMode } from './ActionEditorSheet';
import { KeyAreaEditor } from './KeyAreaEditor';
import { describeSchedule, formatShortDate, relativeDay } from './format';
import { AreaBlock } from './MatrixSheet';
import { AREA_COUNT, SLOT_COUNT, buildMatrix } from '@shared/application/matrix';

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
  /**
   * Planning suggestions: true when the plan includes them, false to show them as Harada Pro,
   * undefined to leave them out (plan unknown).
   */
  aiPlanning?: boolean;
}

type OutcomePatch = Pick<OutcomeFieldsDTO, 'id' | 'title' | 'description' | 'updatedAt'>;

/** Cell size of the key area's block beside the list on wide screens. */
const BLOCK_CELL = 88;

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
  aiPlanning,
}: KeyAreaViewProps) {
  const { colors, radius, space } = useTheme();
  const { wide, width } = useLayout();
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
  // Positions taken by accepted suggestions before the refreshed goal arrives, so two quick Adds
  // never aim at the same slot.
  const claimedSlots = useRef(new Set<number>());
  const claimedAreas = useRef(new Set<number>());

  // Server data is authoritative once the route re-renders with a fresh goal.
  useEffect(() => {
    setOverrides({});
    setOutcomeOverride(null);
    claimedSlots.current.clear();
    claimedAreas.current.clear();
  }, [goal]);

  // A different key area is a different draft.
  useEffect(() => {
    setEditorOpen(false);
    setPendingNav(null);
    setSheetOpen(false);
    claimedSlots.current.clear();
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

  // The area with any in-flight optimistic changes applied: the list and the mini block agree.
  const liveArea = useMemo(
    () => ({
      ...area,
      slots: area.slots.map((s) => ({ ...s, action: s.action ? effective(s.action) : null })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [area, overrides],
  );
  const filledSlots = liveArea.slots.filter((s) => s.action);
  const firstFree = liveArea.slots.find((s) => !s.action);
  const openCount = SLOT_COUNT - filledSlots.length;
  const tasks = filledSlots.filter((s) => s.action!.kind === 'task');
  const tasksDone = tasks.filter((s) => s.action!.completedAt).length;

  const full = (message: string): Result<never> => ({ ok: false, error: { code: 'LIMIT_REACHED', message } });

  /** A suggested action goes into the next free position of this key area. */
  async function addSuggestedAction(item: SuggestedAction): Promise<Result<unknown>> {
    if (!outcome) return full('Add the key area first.');
    const slot = liveArea.slots.find((s) => !s.action && !claimedSlots.current.has(s.position));
    if (!slot) return full('All 8 positions are planned.');
    claimedSlots.current.add(slot.position);
    const res = await matrix.addAction({
      id: newClientId(),
      outcomeId: outcome.id,
      position: slot.position,
      title: item.title.slice(0, LIMITS.actionTitle),
      kind: item.kind,
      ...(item.kind === 'routine'
        ? { schedule: item.cadence === 'weekly' ? { type: 'weekly' as const, timesPerWeek: 1 } : { type: 'daily' as const } }
        : {}),
    });
    if (res.ok) onChanged?.();
    else claimedSlots.current.delete(slot.position);
    return res;
  }

  /** A suggested key area goes into this empty slot first, then the next empty one. */
  async function addSuggestedArea(item: SuggestedArea): Promise<Result<unknown>> {
    const free = (p: number) => !model.areas[p]!.outcome && !claimedAreas.current.has(p);
    const target = free(pos) ? pos : model.areas.find((a) => free(a.position))?.position;
    if (target === undefined) return full('All 8 key areas are filled.');
    claimedAreas.current.add(target);
    const res = await matrix.addOutcome({
      id: newClientId(),
      goalId: goal.id,
      position: target,
      title: item.title.slice(0, LIMITS.outcomeTitle),
    });
    if (res.ok) onChanged?.();
    else claimedAreas.current.delete(target);
    return res;
  }

  function addAt(position: number) {
    if (!outcome) return;
    openSheet({
      type: 'add',
      outcomeId: outcome.id,
      position,
      heading: `${title}: action ${position + 1} of ${SLOT_COUNT}`,
    });
  }

  const list = outcome ? (
    <Section
      title="Actions"
      description={`${filledSlots.length} of ${SLOT_COUNT} positions planned · ${tasksDone} of ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} done`}
      ruled={false}
    >
      <View accessibilityLabel={`Actions in key area ${pos + 1}`}>
        {filledSlots.map((slot, i) => {
          const act = slot.action!;
          const testID = `slot-${pos}-${slot.position}`;
          const done = act.kind === 'task' && !!act.completedAt;
          const checked = act.kind === 'task' ? done : act.checkedToday;
          const isBusy = busy.has(act.id);
          const disabled = act.kind === 'routine' && !act.dueToday;
          const original = area.slots[slot.position]!.action!;
          return (
            <ListRow
              key={slot.position}
              testID={testID}
              title={act.title}
              meta={isBusy ? 'Saving…' : statusText(act, today)}
              metaIcon={act.kind === 'routine' && !isBusy ? 'routine' : undefined}
              done={done}
              divider={i < filledSlots.length - 1 || openCount > 0}
              accessibilityLabel={`Edit action ${slot.position + 1} of ${SLOT_COUNT}: ${act.title}`}
              onPress={() => openSheet({ type: 'edit', action: act })}
              leading={
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text variant="caption" tone="faint" tabular style={{ width: space[4], textAlign: 'right' }}>
                    {slot.position + 1}
                  </Text>
                  <CheckCircle
                    shape={act.kind === 'routine' ? 'square' : 'circle'}
                    checked={checked}
                    accessibilityLabel={`${checked ? 'Reopen' : 'Complete'}: ${act.title}`}
                    busy={isBusy}
                    disabled={disabled}
                    onPress={() => toggle(original)}
                  />
                </View>
              }
              trailing={
                canFocus && !act.archivedAt ? (
                  <FocusToggle
                    on={act.focusedToday}
                    actionTitle={act.title}
                    busy={isBusy}
                    display={wide ? 'label' : 'icon'}
                    onPress={() => toggleFocus(original)}
                  />
                ) : undefined
              }
            />
          );
        })}
      </View>
      {firstFree ? (
        <View style={{ alignItems: 'flex-start', gap: space[1] }}>
          <Button
            testID="add-action"
            title="Add action"
            icon="add"
            variant="ghost"
            accessibilityLabel={`Add action ${firstFree.position + 1} of ${SLOT_COUNT}`}
            onPress={() => addAt(firstFree.position)}
          />
          <Text variant="caption" tone="muted" tabular>
            {`${openCount} of ${SLOT_COUNT} ${openCount === 1 ? 'position' : 'positions'} open`}
          </Text>
        </View>
      ) : (
        <Text variant="caption" tone="muted">
          All 8 positions are planned.
        </Text>
      )}
      {aiPlanning !== undefined && firstFree ? (
        <PlanSuggestions
          mode="actions"
          enabled={aiPlanning}
          goalTitle={goal.title}
          areaTitle={title}
          existingActions={filledSlots.map((s) => s.action!.title)}
          openPositions={openCount}
          onAdd={addSuggestedAction}
        />
      ) : null}
    </Section>
  ) : null;

  const header = !outcome ? (
    <View style={{ gap: space[3] }}>
      <Text variant="title">{`Key area ${pos + 1} is empty`}</Text>
      <Text variant="body" tone="muted">
        Name one outcome that moves the goal forward. You can fill the other key areas later.
      </Text>
      <View style={{ alignItems: 'flex-start' }}>
        <Button title={`Add key area ${pos + 1}`} icon="add" onPress={() => setEditorOpen(true)} />
      </View>
      {aiPlanning !== undefined ? (
        <PlanSuggestions
          mode="areas"
          enabled={aiPlanning}
          goalTitle={goal.title}
          successCriteria={goal.successCriteria}
          existingAreas={model.areas.flatMap((a) => (a.outcome ? [a.outcome.title] : []))}
          openPositions={model.areas.filter((a) => !a.outcome).length}
          onAdd={addSuggestedArea}
        />
      ) : null}
    </View>
  ) : (
    <View style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1, flexShrink: 1 }}>
          {title}
        </Text>
        <IconButton icon="edit" accessibilityLabel="Edit key area" onPress={() => setEditorOpen(true)} />
      </View>
      {description ? (
        <Text variant="body" tone="muted">
          {description}
        </Text>
      ) : null}
      {outcome.measure ? (
        <View
          accessible
          accessibilityLabel={`Measure: ${outcome.measure.current} of ${outcome.measure.target} ${outcome.measure.unit}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}
        >
          <Icon name="measure" size={15} color={colors.inkMuted} />
          <Text variant="meta" tone="muted" tabular>
            {`${outcome.measure.current} / ${outcome.measure.target} ${outcome.measure.unit}`}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const aside =
    outcome && width >= 1024 ? (
      <View style={{ width: BLOCK_CELL * 3 + 3, gap: space[2] }}>
        <AreaBlock
          areas={[...model.areas.slice(0, pos), liveArea, ...model.areas.slice(pos + 1)]}
          goalTitle={goal.title}
          areaPosition={pos}
          cellSize={BLOCK_CELL}
          onOpenAction={(_, slot) => slot.action && openSheet({ type: 'edit', action: slot.action })}
          onAddAction={(_, p) => addAt(p)}
        />
        <Text variant="caption" tone="muted">
          This key area on the full sheet
        </Text>
      </View>
    ) : null;

  return (
    <View style={{ gap: space[4], minWidth: 0 }}>
      <View accessibilityRole="toolbar" accessibilityLabel="Key area navigation" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
        <IconButton icon="back" accessibilityLabel={`Previous key area (${prevPos + 1})`} onPress={() => navigate(prevPos)} />
        <Text variant="caption" tone="muted" weight="semibold" tabular>
          {`Key area ${pos + 1} of ${AREA_COUNT}`}
        </Text>
        <IconButton icon="forward" accessibilityLabel={`Next key area (${nextPos + 1})`} onPress={() => navigate(nextPos)} />
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

      {areaDirty && !editorOpen && pendingNav === null && outcome ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Icon name="warning" size={16} color={colors.warning} />
          <Text variant="meta" tone="warning" style={{ flex: 1 }}>
            Unsaved changes to this key area
          </Text>
          <Button title="Continue editing" variant="secondary" size="compact" onPress={() => setEditorOpen(true)} />
        </View>
      ) : null}

      {aside ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[8] }}>
          <View style={{ flex: 1, maxWidth: CONTENT_MAX_WIDTH, gap: space[4], minWidth: 0 }}>
            {header}
            {list}
          </View>
          {aside}
        </View>
      ) : (
        <>
          {header}
          {list}
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
