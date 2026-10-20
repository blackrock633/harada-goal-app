'use client';

import * as React from 'react';
import type { ReflectionDTO } from '@/application/dto';
import { addReflectionSchema } from '@/application/schemas';
import type { ReviewMutations } from '@/ui/actions';
import { errorMessage, newClientId } from '@/ui/errors';
import { Button, Field, Textarea } from '@/ui/primitives';

export interface ReflectionFormProps {
  goalId: string;
  today: string;
  addReflection: ReviewMutations['addReflection'];
  onSaved?: (reflection: ReflectionDTO) => void;
}

type FieldKey = 'wentWell' | 'didntGoWell' | 'nextChange';

const PROMPTS: { key: FieldKey; label: string }[] = [
  { key: 'wentWell', label: 'What went well?' },
  { key: 'didntGoWell', label: "What didn't?" },
  { key: 'nextChange', label: 'What will you change?' },
];

export function ReflectionForm({ goalId, today, addReflection, onSaved }: ReflectionFormProps) {
  const [kind, setKind] = React.useState<'daily' | 'weekly'>('daily');
  const [date, setDate] = React.useState(today);
  const [values, setValues] = React.useState<Record<FieldKey, string>>({
    wentWell: '',
    didntGoWell: '',
    nextChange: '',
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [saved, setSaved] = React.useState(false);
  // One client id per logical save: reused on retry, replaced after a successful save.
  const clientId = React.useRef<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaved(false);
    setError(null);
    setFieldErrors({});
    if (!PROMPTS.some((p) => values[p.key].trim() !== '')) {
      setError('Write something in at least one box before saving.');
      return;
    }
    clientId.current ??= newClientId();
    const input = {
      id: clientId.current,
      goalId,
      date,
      kind,
      wentWell: values.wentWell.trim() || undefined,
      didntGoWell: values.didntGoWell.trim() || undefined,
      nextChange: values.nextChange.trim() || undefined,
    };
    const parsed = addReflectionSchema.safeParse(input);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = String(issue.path[0] ?? '');
        if (k && !fe[k]) fe[k] = issue.message;
      }
      setFieldErrors(fe);
      setError('Please fix the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      const res = await addReflection(input);
      if (res.ok) {
        setValues({ wentWell: '', didntGoWell: '', nextChange: '' });
        clientId.current = null;
        setSaved(true);
        onSaved?.(res.data);
      } else {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.error.fieldErrors ?? {})) if (v[0]) fe[k] = v[0];
        setFieldErrors(fe);
        setError(errorMessage(res.error));
      }
    } catch {
      setError(errorMessage({ code: 'UNAVAILABLE', message: '' }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="flex flex-wrap items-end gap-4">
        <div role="group" aria-label="Reflection type" className="inline-flex rounded-[var(--radius-sm)] border border-rule-strong">
          {(['daily', 'weekly'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-[44px] min-w-[44px] px-4 text-sm font-medium capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                kind === k ? 'bg-accent text-accent-ink' : 'bg-surface text-ink'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <Field label="Date" error={fieldErrors.date}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-[44px] rounded-[var(--radius-sm)] border border-rule-strong bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </Field>
      </div>
      {PROMPTS.map((p) => (
        <Field key={p.key} label={p.label} error={fieldErrors[p.key]}>
          <Textarea
            value={values[p.key]}
            onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
            disabled={saving}
            rows={3}
          />
        </Field>
      ))}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="text-sm text-success">
          Reflection saved.
        </p>
      )}
      <Button type="submit" loading={saving}>
        Save reflection
      </Button>
    </form>
  );
}
