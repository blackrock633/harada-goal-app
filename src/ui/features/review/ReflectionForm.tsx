'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ReflectionDTO } from '@/application/dto';
import { addReflectionSchema } from '@/application/schemas';
import type { ReviewMutations } from '@/ui/actions';
import { errorMessage, newClientId } from '@/ui/errors';
import { Button, DateInput, Field, Textarea } from '@/ui/primitives';
import { routes } from '@/ui/routes';

export interface ReflectionFormProps {
  goalId: string;
  today: string;
  addReflection: ReviewMutations['addReflection'];
  onSaved?: (reflection: ReflectionDTO) => void;
  /** Whether the user has Harada Pro (advanced_reviews); weekly reflections require Pro. */
  advanced?: boolean;
}

type FieldKey = 'wentWell' | 'didntGoWell' | 'nextChange';

const PROMPTS: { key: FieldKey; label: string }[] = [
  { key: 'wentWell', label: 'What went well?' },
  { key: 'didntGoWell', label: "What didn't?" },
  { key: 'nextChange', label: 'What will you change?' },
];

export function ReflectionForm({ goalId, today, addReflection, onSaved, advanced = false }: ReflectionFormProps) {
  const [kind, setKind] = React.useState<'daily' | 'weekly'>('daily');
  const [date, setDate] = React.useState(today);
  const [values, setValues] = React.useState<Record<FieldKey, string>>({
    wentWell: '',
    didntGoWell: '',
    nextChange: '',
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [needsPro, setNeedsPro] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [saved, setSaved] = React.useState(false);
  // One client id per logical save: reused on retry, replaced after a successful save.
  const clientId = React.useRef<string | null>(null);
  const locked = kind === 'weekly' && !advanced;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || locked) return;
    setSaved(false);
    setError(null);
    setNeedsPro(false);
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
      } else if (res.error.code === 'UPGRADE_REQUIRED') {
        setNeedsPro(true);
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
        {!locked && (
          <Field label="Date" error={fieldErrors.date}>
            {/* The primitive wires the Field label (A11Y-01), error state and pre-hydration typing. */}
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} className="sm:w-auto" />
          </Field>
        )}
      </div>
      {locked ? (
        <div
          role="region"
          aria-label="Weekly reflections require Harada Pro"
          data-testid="upgrade-prompt-advanced_reviews"
          className="space-y-3 rounded-[var(--radius-md)] border border-accent/40 bg-surface-sunken/60 p-4"
        >
          <p className="font-serif text-lg font-medium text-ink">Reflect. Learn. Improve.</p>
          <p className="text-sm text-ink-muted">
            Weekly reflections help you evaluate your progress, identify what&apos;s holding you back, and adjust your
            approach. Unlock weekly reflections with Harada Pro.
          </p>
          <p className="text-sm text-ink-muted">Weekly reflections are part of Harada Pro. Daily reflections stay free.</p>
          <p className="text-sm">
            <Link href={routes.pricing} className="inline-flex min-h-[44px] items-center font-medium text-accent underline underline-offset-2">
              See Harada Pro
            </Link>
          </p>
        </div>
      ) : (
        <>
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
          {needsPro && (
            <div
              role="alert"
              data-testid="upgrade-prompt-advanced_reviews"
              className="space-y-2 rounded-[var(--radius-md)] border border-accent/40 bg-surface-sunken/60 p-4"
            >
              <p className="font-serif text-base font-medium text-ink">Reflect. Learn. Improve.</p>
              <p className="text-sm text-ink-muted">
                Weekly reflections help you evaluate your progress, identify what&apos;s holding you back, and adjust your
                approach. Unlock weekly reflections with Harada Pro.
              </p>
              <p className="text-sm">
                <Link href={routes.pricing} className="inline-flex min-h-[44px] items-center font-medium text-accent underline underline-offset-2">
                  See Harada Pro
                </Link>
              </p>
            </div>
          )}
          {saved && !error && (
            <p role="status" className="text-sm text-success">
              Reflection saved.
            </p>
          )}
          <Button type="submit" loading={saving}>
            Save reflection
          </Button>
        </>
      )}
    </form>
  );
}
