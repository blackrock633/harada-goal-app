'use client';

import * as React from 'react';
import type { GoalFieldsDTO, TemplateSummaryDTO } from '@/application/dto';
import type { Result } from '@/application/result';
import type { GoalMutations } from '@/ui/actions';
import { routes } from '@/ui/routes';
import { Button, ButtonLink, DateInput, Field, Input } from '@/ui/primitives';
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

export interface GoalOnboardingProps {
  mutations: Pick<GoalMutations, 'createGoal' | 'updateGoal'>;
  templates: TemplateSummaryDTO[];
  onUseTemplate: (id: string) => Promise<Result<GoalFieldsDTO>>;
  today?: string;
}

type Step = 'title' | 'details' | 'done';

export function GoalOnboarding({ mutations, templates, onUseTemplate, today: todayProp }: GoalOnboardingProps) {
  const today = todayProp ?? localToday();
  const [step, setStep] = React.useState<Step>('title');
  const [draft, setDraft] = React.useState<GoalDraft>(emptyDraft);
  const [goal, setGoal] = React.useState<GoalFieldsDTO | null>(null);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [pendingTemplate, setPendingTemplate] = React.useState<string | null>(null);
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

  const busy = pending || pendingTemplate !== null;

  const failWith = (fields: FieldErrors, message: string) => {
    setErrors(fields);
    setFormError(message);
    const first = firstInvalid(fields);
    if (first) setFocusKey((p) => ({ key: first, n: (p?.n ?? 0) + 1 }));
  };

  async function createFirst(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const local = validateDraft({ ...emptyDraft(), title: draft.title, targetDate: draft.targetDate }, today, true);
    if (Object.keys(local).length) return failWith(local, '');
    setErrors({});
    setFormError('');
    setPending(true);
    try {
      const p = buildPayload(draft);
      const out = toOutcome(await mutations.createGoal({ title: p.title, targetDate: p.targetDate }));
      if (out.ok) {
        setGoal(out.data);
        setStep('details');
      } else failWith(out.fields, out.message);
    } catch {
      failWith({}, 'Something went wrong. Your input is still here, so you can try again.');
    } finally {
      setPending(false);
    }
  }

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !goal) return;
    const local = validateDraft(draft, today, false);
    delete local.title;
    delete local.targetDate;
    if (Object.keys(local).length) return failWith(local, '');
    setErrors({});
    setFormError('');
    setPending(true);
    try {
      const p = buildPayload(draft);
      const out = toOutcome(
        await mutations.updateGoal({ goalId: goal.id, vision: p.vision, purpose: p.purpose }),
      );
      if (out.ok) {
        setGoal(out.data);
        setStep('done');
      } else failWith(out.fields, out.message);
    } catch {
      failWith({}, 'Something went wrong. Your input is still here, so you can try again.');
    } finally {
      setPending(false);
    }
  }

  async function chooseTemplate(id: string) {
    if (busy) return;
    setFormError('');
    setPendingTemplate(id);
    try {
      const res = await onUseTemplate(id);
      if (res.ok) {
        setGoal(res.data);
        setStep('done');
      } else setFormError(res.error.message);
    } catch {
      setFormError('Could not use that example. Please try again.');
    } finally {
      setPendingTemplate(null);
    }
  }

  const errorBox = formError ? (
    <p role="alert" className="rounded-[var(--radius-sm)] border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
      {formError}
    </p>
  ) : null;

  if (step === 'done' && goal) {
    return (
      <section aria-labelledby="onb-done" className="space-y-4">
        <h2 id="onb-done" className="font-serif text-2xl text-ink">Your goal is created</h2>
        <p className="font-serif text-lg text-ink break-words">{goal.title}</p>
        <p className="text-ink-muted">
          You don&apos;t need a complete matrix to begin. Add an action to any key area, activate your goal,
          and you can start working on it from Today straight away.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={routes.matrix(goal.id)}>Open your matrix</ButtonLink>
          <ButtonLink href={routes.today} variant="secondary">Go to Today</ButtonLink>
        </div>
      </section>
    );
  }

  if (step === 'details' && goal) {
    return (
      <form onSubmit={saveDetails} noValidate className="space-y-6" aria-label="Goal details">
        <div>
          <h2 className="font-serif text-2xl text-ink">Make it yours (optional)</h2>
          <p className="mt-1 text-ink-muted">
            &ldquo;{goal.title}&rdquo; is saved. These two notes help you stay motivated, and you can skip them.
          </p>
        </div>
        {errorBox}
        <VisionField
          value={draft.vision}
          onChange={(v) => setDraft((d) => ({ ...d, vision: v }))}
          error={errors.vision}
          register={register}
          disabled={busy}
          label="Success looks like"
        />
        <PurposeFields
          purpose={draft.purpose}
          onChange={(k, v) => setDraft((d) => ({ ...d, purpose: { ...d.purpose, [k]: v } }))}
          errors={errors}
          register={register}
          disabled={busy}
        />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={pending} disabled={busy}>Save and continue</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setStep('done')}>
            Skip for now
          </Button>
        </div>
      </form>
    );
  }

  const len = draft.title.length;
  return (
    <div className="space-y-10">
      <form onSubmit={createFirst} noValidate className="space-y-6" aria-label="Create your first goal">
        <div>
          <h2 className="font-serif text-2xl text-ink">What do you want to achieve?</h2>
          <p className="mt-1 text-ink-muted">Start with one sentence. Everything else can wait.</p>
        </div>
        {errorBox}
        <div>
          <Field label="Your goal" error={errors.title}>
            <Input
              ref={register('title') as React.Ref<HTMLInputElement>}
              value={draft.title}
              disabled={busy}
              autoComplete="off"
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
          </Field>
          {len >= FIELD_LIMITS.title * 0.8 && (
            <p className={`text-right text-sm tabular-nums ${len > FIELD_LIMITS.title ? 'text-danger' : 'text-ink-muted'}`}>
              {len}/{FIELD_LIMITS.title}
            </p>
          )}
        </div>
        <Field label="Target date (optional)" hint="Must be in the future." error={errors.targetDate}>
          <DateInput
            ref={register('targetDate') as React.Ref<HTMLInputElement>}
            value={draft.targetDate}
            disabled={busy}
            onChange={(e) => setDraft((d) => ({ ...d, targetDate: e.target.value }))}
          />
        </Field>
        <Button type="submit" loading={pending} disabled={busy}>Create goal</Button>
      </form>

      {templates.length > 0 && (
        <section aria-labelledby="onb-examples" className="space-y-3 border-t border-rule pt-6">
          <h2 id="onb-examples" className="font-serif text-xl text-ink">Or start from an example</h2>
          <p className="text-sm text-ink-muted">
            An example creates a new goal with ready-made key areas and actions that you can change.
          </p>
          <ul className="divide-y divide-rule">
            {templates.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{t.name}</p>
                  <p className="text-sm text-ink-muted">{t.summary}</p>
                  <p className="text-sm text-ink-muted tabular-nums">
                    {t.outcomeCount} key areas, {t.actionCount} actions
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={pendingTemplate === t.id}
                  disabled={busy}
                  aria-label={`Use example: ${t.name}`}
                  onClick={() => chooseTemplate(t.id)}
                >
                  Use this
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
