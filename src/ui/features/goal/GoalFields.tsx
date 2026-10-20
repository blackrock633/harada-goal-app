'use client';

import * as React from 'react';
import { Field, Textarea } from '@/ui/primitives';
import {
  FIELD_LIMITS,
  PURPOSE_FIELDS,
  type FieldErrors,
  type FieldKey,
  type GoalDraft,
  type PurposeKey,
  criteriaNeedsSignal,
} from './goalLogic';

export type RegisterRef = (key: FieldKey) => (el: HTMLElement | null) => void;

function Counter({ length, max }: { length: number; max: number }) {
  if (length < max * 0.8) return null;
  const over = length > max;
  return (
    <p className={`text-right text-sm tabular-nums ${over ? 'text-danger' : 'text-ink-muted'}`}>
      {length}/{max}
    </p>
  );
}

export function SuccessCriteriaField({
  value,
  onChange,
  error,
  register,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  register?: RegisterRef;
  disabled?: boolean;
}) {
  const showHint = !error && criteriaNeedsSignal(value);
  return (
    <div>
      <Field
        label="How you'll know you've succeeded (optional)"
        hint="Something observable — a number, a date, or something someone else would notice. Include where you're starting from if it helps."
        error={error}
      >
        <Textarea
          ref={register?.('successCriteria') as React.Ref<HTMLTextAreaElement>}
          value={value}
          disabled={disabled}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
      <Counter length={value.length} max={FIELD_LIMITS.successCriteria} />
      {showHint && (
        <p role="note" className="mt-1 text-sm text-ink-muted">
          Tip: this reads as qualitative, which is fine. If you can, add one thing you could observe, such
          as a number or a date. You can set measurable targets per key area later.
        </p>
      )}
    </div>
  );
}

export function VisionField({
  value,
  onChange,
  error,
  register,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  register?: RegisterRef;
  disabled?: boolean;
}) {
  return (
    <div>
      <Field
        label="Vision (optional)"
        hint="The picture of the future, and why this goal matters to you."
        error={error}
      >
        <Textarea
          ref={register?.('vision') as React.Ref<HTMLTextAreaElement>}
          value={value}
          disabled={disabled}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
      <Counter length={value.length} max={FIELD_LIMITS.vision} />
    </div>
  );
}

export function PurposeFields({
  purpose,
  onChange,
  errors,
  register,
  disabled,
}: {
  purpose: GoalDraft['purpose'];
  onChange: (key: PurposeKey, v: string) => void;
  errors: FieldErrors;
  register?: RegisterRef;
  disabled?: boolean;
}) {
  const hasExtra = PURPOSE_FIELDS.slice(1).some((f) => purpose[f.key].trim() || errors[f.key]);
  const [open, setOpen] = React.useState(hasExtra);
  const expanded = open || hasExtra;
  const regionId = React.useId();
  const visible = expanded ? PURPOSE_FIELDS : PURPOSE_FIELDS.slice(0, 1);

  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-medium text-ink">Why it matters</legend>
      <p className="text-sm text-ink-muted">
        Your reasons are saved as the four purpose notes on this goal. All of them are optional.
      </p>
      <div id={regionId} className="space-y-4">
        {visible.map((f) => (
          <div key={f.key}>
            <Field label={f.label} hint={f.hint} error={errors[f.key]}>
              <Textarea
                ref={register?.(f.key) as React.Ref<HTMLTextAreaElement>}
                value={purpose[f.key]}
                disabled={disabled}
                rows={2}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            </Field>
            <Counter length={purpose[f.key].length} max={FIELD_LIMITS.purpose} />
          </div>
        ))}
      </div>
      {!expanded && (
        <button
          type="button"
          aria-expanded={false}
          aria-controls={regionId}
          onClick={() => setOpen(true)}
          className="min-h-[44px] text-sm font-medium text-accent underline underline-offset-2"
        >
          Add more reasons
        </button>
      )}
    </fieldset>
  );
}
