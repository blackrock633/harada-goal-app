import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { newClientId } from '@/data/errors';
import type { GoalMutations } from '@/data/mutations';
import { useTheme } from '@/theme';
import { Button, Text, TextField, type TextFieldHandle } from '@/ui';
import type { GoalFieldsDTO } from '@shared/application/dto';

import { DetailsFields } from './GoalFields';
import {
  FIELD_LIMITS,
  buildPayload,
  emptyDraft,
  localToday,
  toOutcome,
  validateDraft,
  type FieldErrors,
  type GoalDraft,
  firstInvalid,
  type FieldKey,
} from './goalLogic';

export type GoalFormProps = {
  mode: 'create' | 'edit';
  /** Required in edit mode: prefill source. */
  goal?: GoalFieldsDTO;
  mutations: Pick<GoalMutations, 'createGoal' | 'updateGoal'>;
  onCreated?: (goal: GoalFieldsDTO) => void;
  onSaved?: (goal: GoalFieldsDTO) => void;
  onCancel?: () => void;
  /** Called by "Reload latest", shown after a CONFLICT. */
  onReloadLatest?: () => void;
  /** Local date 'YYYY-MM-DD'; defaults to the device's today. Injectable for tests. */
  today?: string;
};

function draftFrom(goal?: GoalFieldsDTO): GoalDraft {
  if (!goal) return emptyDraft();
  return {
    title: goal.title,
    vision: goal.vision,
    successCriteria: goal.successCriteria,
    targetDate: goal.targetDate ?? '',
    purpose: { ...goal.purpose },
  };
}

export function GoalForm({
  mode,
  goal,
  mutations,
  onCreated,
  onSaved,
  onCancel,
  onReloadLatest,
  today: todayProp,
}: GoalFormProps) {
  const { space, colors } = useTheme();
  const today = todayProp ?? localToday();
  const isEdit = mode === 'edit';
  const [draft, setDraft] = useState<GoalDraft>(() => draftFrom(goal));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const inFlight = useRef(false);
  // A11Y-02: after a failed submit, move focus to the first invalid field (as the web form does).
  const fieldRefs = useRef<Partial<Record<FieldKey, TextFieldHandle | null>>>({});
  const focusNext = useRef<FieldKey | null>(null);
  const register = (key: FieldKey) => (el: TextFieldHandle | null) => {
    fieldRefs.current[key] = el;
  };
  useEffect(() => {
    const key = focusNext.current;
    if (!key) return;
    focusNext.current = null;
    fieldRefs.current[key]?.focus();
  }, [errors]);
  // One client id per create: reused on retry so a retried create is idempotent.
  const createIdRef = useRef<string | null>(null);
  // Latest updatedAt we know about; sent as expectedUpdatedAt on edit.
  const baselineRef = useRef<string | undefined>(goal?.updatedAt);

  // A fresher goal arrived from the parent (after "Reload latest"): adopt it.
  useEffect(() => {
    if (goal && goal.updatedAt !== baselineRef.current) {
      baselineRef.current = goal.updatedAt;
      setDraft(draftFrom(goal));
      setErrors({});
      setFormError('');
      setConflict(false);
    }
  }, [goal]);

  const pastDateWarning =
    isEdit && draft.targetDate && draft.targetDate <= today && !errors.targetDate
      ? 'This date has already passed. You can keep it, but your pace will show as overdue.'
      : '';

  async function submit() {
    if (inFlight.current) return;
    const local = validateDraft(draft, today, !isEdit);
    if (Object.keys(local).length > 0) {
      focusNext.current = firstInvalid(local);
      setErrors(local);
      setFormError('');
      return;
    }
    inFlight.current = true;
    setErrors({});
    setFormError('');
    setConflict(false);
    setPending(true);
    try {
      const payload = buildPayload(draft);
      createIdRef.current ??= newClientId();
      const res =
        isEdit && goal
          ? await mutations.updateGoal({
              goalId: goal.id,
              expectedUpdatedAt: baselineRef.current ?? goal.updatedAt,
              ...payload,
            })
          : await mutations.createGoal({ id: createIdRef.current, ...payload });
      const out = toOutcome(res);
      if (out.ok) {
        if (isEdit) {
          baselineRef.current = out.data.updatedAt;
          setDraft(draftFrom(out.data));
          onSaved?.(out.data);
        } else {
          createIdRef.current = null;
          onCreated?.(out.data);
        }
      } else {
        if (out.code === 'CONFLICT') setConflict(true);
        focusNext.current = firstInvalid(out.fields);
        setErrors(out.fields);
        setFormError(out.message);
      }
    } catch {
      setFormError('Something went wrong. Your changes are still here, so you can try again.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <View style={{ gap: space[5] }}>
      {isEdit ? (
        <Text variant="meta" tone="muted">
          Changing your goal keeps your key areas and actions.
        </Text>
      ) : null}

      {formError ? (
        <View
          accessibilityRole="alert"
          style={{ borderWidth: 1, borderColor: colors.danger, padding: space[3], gap: space[2], borderRadius: 6 }}
        >
          <Text variant="meta" tone="danger">
            {formError}
          </Text>
          {conflict && onReloadLatest ? (
            <Button title="Reload latest" variant="secondary" onPress={onReloadLatest} />
          ) : null}
        </View>
      ) : null}

      <TextField
        label="What is your goal?"
        hint="One clear sentence. You can refine it later."
        ref={register('title')}
        value={draft.title}
        onChangeText={(v) => setDraft((d) => ({ ...d, title: v }))}
        error={errors.title}
        editable={!pending}
        maxLength={FIELD_LIMITS.title}
        autoComplete="off"
      />

      <View style={{ gap: space[2] }}>
        <TextField
          label="Target date (optional)"
          hint={
            isEdit
              ? 'Format YYYY-MM-DD.'
              : 'Format YYYY-MM-DD. Must be in the future. Leave empty if there is no deadline.'
          }
          ref={register('targetDate')}
          value={draft.targetDate}
          onChangeText={(v) => setDraft((d) => ({ ...d, targetDate: v.trim() }))}
          error={errors.targetDate}
          editable={!pending}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          maxLength={10}
        />
        {pastDateWarning ? (
          <Text variant="meta" tone="warning" accessibilityRole="alert">
            {pastDateWarning}
          </Text>
        ) : null}
      </View>

      <DetailsFields
        draft={draft}
        errors={errors}
        disabled={pending}
        register={register}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        onChangePurpose={(k, v) => setDraft((d) => ({ ...d, purpose: { ...d.purpose, [k]: v } }))}
      />

      <View style={{ gap: space[3] }}>
        <Button title={isEdit ? 'Save goal' : 'Create goal'} loading={pending} onPress={submit} />
        {onCancel ? <Button title="Cancel" variant="ghost" disabled={pending} onPress={onCancel} /> : null}
      </View>
    </View>
  );
}
