'use client';

import * as React from 'react';
import Link from 'next/link';
import type { GoalFieldsDTO } from '@/application/dto';
import type { GoalMutations } from '@/ui/actions';
import { Button, DateInput, Field, Input } from '@/ui/primitives';
import { formatLocalDate } from '@/ui/format';
import { PurposeFields, VisionField } from './GoalFields';
import {
  FIELD_LIMITS,
  buildPayload,
  emptyDraft,
  firstInvalid,
  localToday,
  toOutcome,
  validateDraft,
  type FieldErrors,
  type FieldKey,
  type GoalDraft,
} from './goalLogic';

export interface GoalFormProps {
  mode: 'create' | 'edit';
  /** Required in edit mode: prefill source. */
  goal?: GoalFieldsDTO;
  mutations: Pick<GoalMutations, 'createGoal' | 'updateGoal'>;
  onCreated?: (goal: GoalFieldsDTO) => void;
  onSaved?: (goal: GoalFieldsDTO) => void;
  /** Where "Cancel" goes. */
  cancelHref?: string;
  /** Local date 'YYYY-MM-DD'; defaults to the browser's today. Injectable for tests. */
  today?: string;
}

function draftFrom(goal?: GoalFieldsDTO): GoalDraft {
  if (!goal) return emptyDraft();
  return {
    title: goal.title,
    vision: goal.vision,
    targetDate: goal.targetDate ?? '',
    purpose: { ...goal.purpose },
  };
}

export function GoalForm({ mode, goal, mutations, onCreated, onSaved, cancelHref, today: todayProp }: GoalFormProps) {
  const today = todayProp ?? localToday();
  const [draft, setDraft] = React.useState<GoalDraft>(() => draftFrom(goal));
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const refs = React.useRef<Partial<Record<FieldKey, HTMLElement | null>>>({});
  const [focusKey, setFocusKey] = React.useState<{ key: FieldKey; n: number } | null>(null);

  const register = React.useCallback(
    (key: FieldKey) => (el: HTMLElement | null) => {
      refs.current[key] = el;
    },
    [],
  );

  React.useEffect(() => {
    if (focusKey) refs.current[focusKey.key]?.focus();
  }, [focusKey]);

  const isEdit = mode === 'edit';
  const pastDateWarning =
    isEdit && draft.targetDate && draft.targetDate <= today && !errors.targetDate
      ? 'This date has already passed. You can keep it, but your pace will show as overdue.'
      : '';

  const failWith = (fields: FieldErrors, message: string) => {
    setErrors(fields);
    setFormError(message);
    const first = firstInvalid(fields);
    if (first) setFocusKey((p) => ({ key: first, n: (p?.n ?? 0) + 1 }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const local = validateDraft(draft, today, !isEdit);
    if (Object.keys(local).length > 0) {
      failWith(local, '');
      return;
    }
    setErrors({});
    setFormError('');
    setPending(true);
    try {
      const payload = buildPayload(draft);
      const res =
        isEdit && goal
          ? await mutations.updateGoal({ goalId: goal.id, ...payload })
          : await mutations.createGoal(payload);
      const out = toOutcome(res);
      if (out.ok) {
        if (isEdit) {
          // Show exactly what was persisted, not what was typed.
          setDraft(draftFrom(out.data));
          onSaved?.(out.data);
        }
        else onCreated?.(out.data);
      } else {
        failWith(out.fields, out.message);
      }
    } catch {
      failWith({}, 'Something went wrong. Your changes are still here, so you can try again.');
    } finally {
      setPending(false);
    }
  }

  const set = <K extends 'title' | 'vision' | 'targetDate'>(k: K, v: string) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const titleLen = draft.title.length;

  return (
    <form onSubmit={submit} noValidate className="space-y-6" aria-label={isEdit ? 'Edit goal' : 'New goal'}>
      {isEdit && (
        <p className="text-sm text-ink-muted" role="note">
          Changing your goal keeps your key areas and actions.
        </p>
      )}

      {formError && (
        <p role="alert" className="rounded-[var(--radius-sm)] border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {formError}
        </p>
      )}

      <div>
        <Field label="What is your goal?" hint="One clear sentence. You can refine it later." error={errors.title}>
          <Input
            ref={register('title') as React.Ref<HTMLInputElement>}
            value={draft.title}
            disabled={pending}
            autoComplete="off"
            onChange={(e) => set('title', e.target.value)}
          />
        </Field>
        {titleLen >= FIELD_LIMITS.title * 0.8 && (
          <p className={`text-right text-sm tabular-nums ${titleLen > FIELD_LIMITS.title ? 'text-danger' : 'text-ink-muted'}`}>
            {titleLen}/{FIELD_LIMITS.title}
          </p>
        )}
      </div>

      <Field
        label="Target date (optional)"
        hint={isEdit ? undefined : 'Must be in the future. Leave empty if there is no deadline.'}
        error={errors.targetDate}
      >
        <DateInput
          ref={register('targetDate') as React.Ref<HTMLInputElement>}
          value={draft.targetDate}
          disabled={pending}
          onChange={(e) => set('targetDate', e.target.value)}
        />
      </Field>
      {pastDateWarning && (
        <p role="status" className="-mt-4 text-sm text-warning">
          {pastDateWarning} ({formatLocalDate(draft.targetDate, 'medium')})
        </p>
      )}

      <VisionField
        value={draft.vision}
        onChange={(v) => set('vision', v)}
        error={errors.vision}
        register={register}
        disabled={pending}
      />
      <p className="-mt-4 text-sm text-ink-muted">
        This is saved as your goal&apos;s vision. Measurable targets live on each key area.
      </p>

      <PurposeFields
        purpose={draft.purpose}
        onChange={(k, v) => setDraft((d) => ({ ...d, purpose: { ...d.purpose, [k]: v } }))}
        errors={errors}
        register={register}
        disabled={pending}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} disabled={pending}>
          {isEdit ? 'Save changes' : 'Create goal'}
        </Button>
        {cancelHref && (
          <Link href={cancelHref} className="inline-flex min-h-[44px] items-center text-sm text-ink-muted underline underline-offset-2">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
