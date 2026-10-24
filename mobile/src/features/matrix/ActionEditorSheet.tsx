import { useRef, useState } from 'react';
import { View } from 'react-native';

import { newClientId } from '@/data/errors';
import type { MatrixMutations } from '@/data/mutations';
import { useTheme } from '@/theme';
import { Button, DateField, SegmentedControl, Sheet, Text, TextField } from '@/ui';
import type { ActionDTO } from '@shared/application/dto';
import { addActionSchema, updateActionSchema } from '@shared/application/schemas';
import { LIMITS } from '@shared/domain/limits';

import { Chip } from './Chip';
import { FormError, toFailure, type FormFailure } from './FormError';
import {
  type FieldErrors,
  type ScheduleState,
  scheduleToState,
  serverFieldErrors,
  stateToSchedule,
  zodFieldErrors,
} from './form-utils';
import { DAY_NAMES } from './format';

const KINDS = [
  { value: 'task', label: 'Task' },
  { value: 'routine', label: 'Routine' },
] as const;

export type ActionEditorMode =
  | { type: 'add'; outcomeId: string; /** Action slot 0..7 being filled. */ position: number; heading?: string }
  | { type: 'edit'; action: ActionDTO };

export interface ActionEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  mode: ActionEditorMode;
  mutations: Pick<MatrixMutations, 'addAction' | 'updateAction'>;
  /** Called after the server accepted the change (before the sheet closes). */
  onSaved?: (action: ActionDTO) => void;
  /** Offered on CONFLICT; the route should refetch the latest data. */
  onReloadLatest?: () => void;
}

/**
 * Add/edit an action. Form state is initialised from `mode` once per mount: the parent remounts
 * it (change `key`) for each new open so a fresh client id and fresh fields are used.
 */
export function ActionEditorSheet({ visible, onClose, mode, mutations, onSaved, onReloadLatest }: ActionEditorSheetProps) {
  const { space } = useTheme();
  const initial = mode.type === 'edit' ? mode.action : null;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [kind, setKind] = useState<'task' | 'routine'>(initial?.kind ?? 'task');
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [sched, setSched] = useState<ScheduleState>(scheduleToState(initial?.schedule));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<FormFailure | null>(null);
  // One client id per logical create: reused across retries, renewed only after success.
  const clientId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);

  async function submit() {
    if (inFlight.current) return;
    const common = {
      title,
      notes,
      dueDate: kind === 'task' ? dueDate.trim() || null : null,
      schedule: kind === 'routine' ? stateToSchedule(sched) : null,
    };
    const parsed =
      mode.type === 'add'
        ? addActionSchema.safeParse({
            id: (clientId.current ??= newClientId()),
            outcomeId: mode.outcomeId,
            position: mode.position,
            kind,
            ...common,
          })
        : updateActionSchema.safeParse({
            actionId: mode.action.id,
            expectedUpdatedAt: mode.action.updatedAt,
            ...(kind !== mode.action.kind ? { kind } : {}),
            ...common,
          });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      setFormError(null);
      return;
    }
    setErrors({});
    setFormError(null);
    inFlight.current = true;
    setPending(true);
    try {
      const res =
        mode.type === 'add'
          ? await mutations.addAction(parsed.data as Parameters<typeof mutations.addAction>[0])
          : await mutations.updateAction(parsed.data as Parameters<typeof mutations.updateAction>[0]);
      if (res.ok) {
        clientId.current = null;
        inFlight.current = false;
        setPending(false);
        onSaved?.(res.data);
        onClose();
        return;
      }
      setErrors(serverFieldErrors(res.error.fieldErrors));
      setFormError(toFailure(res.error));
    } catch {
      setFormError({ message: 'Something went wrong. Your changes are still here; try again.', conflict: false });
    }
    inFlight.current = false;
    setPending(false);
  }

  const toggleDay = (d: number) =>
    setSched((s) => ({ ...s, days: s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d] }));

  const isAdd = mode.type === 'add';
  return (
    <Sheet
      visible={visible}
      onClose={() => {
        if (!inFlight.current) onClose(); // never dismiss mid-save
      }}
      title={isAdd ? 'Add action' : 'Edit action'}
      footer={
        <View style={{ gap: space[3] }}>
          {formError ? <FormError failure={formError} onReloadLatest={onReloadLatest} /> : null}
          <Button title={isAdd ? 'Add action' : 'Save changes'} loading={pending} onPress={() => void submit()} />
        </View>
      }
    >
      {isAdd && mode.heading ? (
        <Text variant="meta" tone="muted" style={{ flexShrink: 1 }}>
          {mode.heading}
        </Text>
      ) : null}
      <TextField
        label="Title"
        value={title}
        onChangeText={setTitle}
        error={errors.title}
        hint={`${title.length}/${LIMITS.actionTitle}`}
        autoComplete="off"
        editable={!pending}
      />
      <TextField
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        error={errors.notes}
        multiline
        editable={!pending}
      />
      <View style={{ gap: space[1] }}>
        <Text variant="meta" weight="medium" tone="muted">
          Type
        </Text>
        <SegmentedControl
          label="Type"
          options={KINDS}
          value={kind}
          onChange={(k) => !pending && setKind(k)}
        />
        {errors.kind ? (
          <Text variant="caption" tone="danger">
            {errors.kind}
          </Text>
        ) : null}
      </View>
      {kind === 'task' ? (
        <DateField label="Due date (optional)" value={dueDate} onChange={setDueDate} error={errors.dueDate} clearable />
      ) : (
        <View style={{ gap: space[3] }}>
          <View style={{ gap: space[2] }}>
            <Text variant="meta" weight="medium" tone="muted">
              Schedule
            </Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Schedule" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              <Chip role="radio" label="Every day" selected={sched.type === 'daily'} onPress={() => setSched((s) => ({ ...s, type: 'daily' }))} disabled={pending} />
              <Chip role="radio" label="Specific weekdays" selected={sched.type === 'weekdays'} onPress={() => setSched((s) => ({ ...s, type: 'weekdays' }))} disabled={pending} />
              <Chip role="radio" label="N times per week" selected={sched.type === 'weekly'} onPress={() => setSched((s) => ({ ...s, type: 'weekly' }))} disabled={pending} />
            </View>
            {errors.schedule ? (
              <Text variant="caption" tone="danger">
                {errors.schedule}
              </Text>
            ) : null}
          </View>
          {sched.type === 'weekdays' ? (
            <View style={{ gap: space[2] }}>
              <Text variant="meta" weight="medium" tone="muted">
                Days
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                {DAY_NAMES.map((label, d) => (
                  <Chip key={label} role="checkbox" label={label} selected={sched.days.includes(d)} onPress={() => toggleDay(d)} disabled={pending} />
                ))}
              </View>
            </View>
          ) : null}
          {sched.type === 'weekly' ? (
            <TextField
              label="Times per week"
              value={sched.timesPerWeek}
              onChangeText={(t) => setSched((s) => ({ ...s, timesPerWeek: t }))}
              keyboardType="number-pad"
              editable={!pending}
            />
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
