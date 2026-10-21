import { useRef, useState } from 'react';
import { View } from 'react-native';

import { errorMessage, newClientId } from '@/data/errors';
import type { GoalMutations } from '@/data/mutations';
import { useTheme } from '@/theme';
import { Button, Text, TextField } from '@/ui';
import type { GoalFieldsDTO, TemplateSummaryDTO } from '@shared/application/dto';
import type { Result } from '@shared/application/result';

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
} from './goalLogic';

export type GoalOnboardingProps = {
  mutations: Pick<GoalMutations, 'createGoal' | 'updateGoal'>;
  templates: TemplateSummaryDTO[];
  /** `clientId` is stable across retries of the same template choice (idempotency). */
  onUseTemplate: (templateId: string, clientId: string) => Promise<Result<GoalFieldsDTO>>;
  onOpenMatrix: (goalId: string) => void;
  onGoToToday: () => void;
  /** Local date 'YYYY-MM-DD'; injectable for tests. */
  today?: string;
};

type Step = 'title' | 'details' | 'done';

export function GoalOnboarding({
  mutations,
  templates,
  onUseTemplate,
  onOpenMatrix,
  onGoToToday,
  today: todayProp,
}: GoalOnboardingProps) {
  const { space, colors } = useTheme();
  const today = todayProp ?? localToday();
  const [step, setStep] = useState<Step>('title');
  const [draft, setDraft] = useState<GoalDraft>(emptyDraft);
  const [goal, setGoal] = useState<GoalFieldsDTO | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const inFlight = useRef(false);
  const createIdRef = useRef<string | null>(null);
  const templateIdRef = useRef<{ templateId: string; id: string } | null>(null);
  const busy = pending || pendingTemplate !== null;

  async function createFirst() {
    if (inFlight.current) return;
    const local = validateDraft(
      { ...emptyDraft(), title: draft.title, targetDate: draft.targetDate },
      today,
      true,
    );
    if (Object.keys(local).length) {
      setErrors(local);
      setFormError('');
      return;
    }
    inFlight.current = true;
    setErrors({});
    setFormError('');
    setPending(true);
    try {
      const p = buildPayload(draft);
      createIdRef.current ??= newClientId();
      const out = toOutcome(
        await mutations.createGoal({ id: createIdRef.current, title: p.title, targetDate: p.targetDate }),
      );
      if (out.ok) {
        createIdRef.current = null;
        setGoal(out.data);
        setStep('details');
      } else {
        setErrors(out.fields);
        setFormError(out.message);
      }
    } catch {
      setFormError('Something went wrong. Your input is still here, so you can try again.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function saveDetails() {
    if (inFlight.current || !goal) return;
    const local = validateDraft(draft, today, false);
    delete local.title;
    delete local.targetDate;
    if (Object.keys(local).length) {
      setErrors(local);
      setFormError('');
      return;
    }
    inFlight.current = true;
    setErrors({});
    setFormError('');
    setPending(true);
    try {
      const p = buildPayload(draft);
      const out = toOutcome(
        await mutations.updateGoal({
          goalId: goal.id,
          expectedUpdatedAt: goal.updatedAt,
          successCriteria: p.successCriteria,
          vision: p.vision,
          purpose: p.purpose,
        }),
      );
      if (out.ok) {
        setGoal(out.data);
        setStep('done');
      } else {
        setErrors(out.fields);
        setFormError(out.message);
      }
    } catch {
      setFormError('Something went wrong. Your input is still here, so you can try again.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function chooseTemplate(id: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setFormError('');
    setPendingTemplate(id);
    try {
      if (templateIdRef.current?.templateId !== id) templateIdRef.current = { templateId: id, id: newClientId() };
      const res = await onUseTemplate(id, templateIdRef.current.id);
      if (res.ok) {
        templateIdRef.current = null;
        setGoal(res.data);
        setStep('done');
      } else {
        setFormError(errorMessage(res.error));
      }
    } catch {
      setFormError('Could not use that example. Please try again.');
    } finally {
      inFlight.current = false;
      setPendingTemplate(null);
    }
  }

  const errorBox = formError ? (
    <View
      accessibilityRole="alert"
      style={{ borderWidth: 1, borderColor: colors.danger, padding: space[3], borderRadius: 6 }}
    >
      <Text variant="meta" tone="danger">
        {formError}
      </Text>
    </View>
  ) : null;

  if (step === 'done' && goal) {
    return (
      <View style={{ gap: space[4] }}>
        <Text variant="title">Your goal is created</Text>
        <Text variant="heading">{goal.title}</Text>
        <Text tone="muted">
          You don&apos;t need a complete matrix to begin. Add an action to any key area, activate your goal, and
          you can start working on it from Today straight away.
        </Text>
        <Button title="Open matrix" onPress={() => onOpenMatrix(goal.id)} />
        <Button title="Go to Today" variant="secondary" onPress={onGoToToday} />
      </View>
    );
  }

  if (step === 'details' && goal) {
    return (
      <View style={{ gap: space[5] }}>
        <View style={{ gap: space[1] }}>
          <Text variant="title">Make it yours (optional)</Text>
          <Text tone="muted">&ldquo;{goal.title}&rdquo; is saved. These notes are optional, and you can skip them.</Text>
        </View>
        {errorBox}
        <DetailsFields
          draft={draft}
          errors={errors}
          disabled={busy}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          onChangePurpose={(k, v) => setDraft((d) => ({ ...d, purpose: { ...d.purpose, [k]: v } }))}
        />
        <View style={{ gap: space[3] }}>
          <Button title="Save and continue" loading={pending} disabled={busy} onPress={saveDetails} />
          <Button title="Skip for now" variant="ghost" disabled={busy} onPress={() => setStep('done')} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: space[8] }}>
      <View style={{ gap: space[5] }}>
        <View style={{ gap: space[1] }}>
          <Text variant="title">What do you want to achieve?</Text>
          <Text tone="muted">Start with one sentence. Everything else can wait.</Text>
        </View>
        {errorBox}
        <TextField
          label="Your goal"
          value={draft.title}
          onChangeText={(v) => setDraft((d) => ({ ...d, title: v }))}
          error={errors.title}
          editable={!busy}
          maxLength={FIELD_LIMITS.title}
          autoComplete="off"
        />
        <TextField
          label="Target date (optional)"
          hint="Format YYYY-MM-DD. Must be in the future."
          value={draft.targetDate}
          onChangeText={(v) => setDraft((d) => ({ ...d, targetDate: v.trim() }))}
          error={errors.targetDate}
          editable={!busy}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          maxLength={10}
        />
        <Button title="Create goal" loading={pending} disabled={busy} onPress={createFirst} />
      </View>

      {templates.length > 0 ? (
        <View style={{ gap: space[3], borderTopWidth: 1, borderTopColor: colors.rule, paddingTop: space[5] }}>
          <Text variant="heading">Or start from an example</Text>
          <Text variant="meta" tone="muted">
            An example creates a new goal with ready-made key areas and actions that you can change.
          </Text>
          {templates.map((t) => (
            <View
              key={t.id}
              style={{ gap: space[2], paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.rule }}
            >
              <Text style={{ fontFamily: 'Inter_500Medium' }}>{t.name}</Text>
              <Text variant="meta" tone="muted">
                {t.summary}
              </Text>
              <Text variant="meta" tone="muted">
                {`${t.outcomeCount} key areas, ${t.actionCount} actions`}
              </Text>
              <Button
                title="Use this"
                variant="secondary"
                accessibilityLabel={`Use example: ${t.name}`}
                loading={pendingTemplate === t.id}
                disabled={busy}
                onPress={() => chooseTemplate(t.id)}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
