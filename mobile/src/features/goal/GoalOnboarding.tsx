import { useRef, useState } from 'react';
import { View } from 'react-native';

import { errorMessage, newClientId } from '@/data/errors';
import type { GoalMutations } from '@/data/mutations';
import { useTheme } from '@/theme';
import { Badge, Button, DateField, ListRow, Section, Text, TextField } from '@/ui';
import type { GoalFieldsDTO, TemplateSummaryDTO } from '@shared/application/dto';
import type { Result } from '@shared/application/result';

import { UpgradePrompt } from '../premium/UpgradePrompt';
import { DetailsFields } from './GoalFields';
import {
  FIELD_LIMITS,
  buildPayload,
  emptyDraft,
  localToday,
  nextDay,
  toOutcome,
  validateDraft,
  type FieldErrors,
  type GoalDraft,
} from './goalLogic';

/** A template row: the shipped examples, or the server catalogue (which adds the tier and lock). */
export type OnboardingTemplate = TemplateSummaryDTO & { tier?: 'free' | 'premium'; locked?: boolean };

export type GoalOnboardingProps = {
  mutations: Pick<GoalMutations, 'createGoal' | 'updateGoal'>;
  templates: OnboardingTemplate[];
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
  const { space, colors, radius } = useTheme();
  const today = todayProp ?? localToday();
  const [step, setStep] = useState<Step>('title');
  const [draft, setDraft] = useState<GoalDraft>(emptyDraft);
  const [goal, setGoal] = useState<GoalFieldsDTO | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  // A premium example the user tapped without Pro: explain instead of failing.
  const [lockedTemplate, setLockedTemplate] = useState<string | null>(null);
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
    if (templates.find((t) => t.id === id)?.locked) {
      setLockedTemplate(id);
      return;
    }
    inFlight.current = true;
    setFormError('');
    setLockedTemplate(null);
    setPendingTemplate(id);
    try {
      if (templateIdRef.current?.templateId !== id) templateIdRef.current = { templateId: id, id: newClientId() };
      const res = await onUseTemplate(id, templateIdRef.current.id);
      if (res.ok) {
        templateIdRef.current = null;
        setGoal(res.data);
        setStep('done');
      } else if (res.error.code === 'UPGRADE_REQUIRED') {
        setLockedTemplate(id);
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
      style={{ borderWidth: 1, borderColor: colors.danger, padding: space[3], borderRadius: radius.md }}
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
        <View style={{ gap: space[2] }}>
          <Button title="Open matrix" onPress={() => onOpenMatrix(goal.id)} />
          <Button title="Go to Today" variant="secondary" onPress={onGoToToday} />
        </View>
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
        <DateField
          label="Target date (optional)"
          hint="Leave empty if there is no deadline."
          value={draft.targetDate}
          onChange={(v) => setDraft((d) => ({ ...d, targetDate: v }))}
          error={errors.targetDate}
          min={nextDay(today)}
          clearable
        />
        <Button title="Create goal" loading={pending} disabled={busy} onPress={createFirst} />
      </View>

      {templates.length > 0 ? (
        <Section
          title="Or start from an example"
          description="An example creates a new goal with ready-made key areas and actions. You can change all of it."
        >
          <View>
            {templates.map((t, i) => (
              <View key={t.id}>
                <ListRow
                  title={t.name}
                  meta={`${t.summary}\n${t.outcomeCount} key areas · ${t.actionCount} actions`}
                  divider={i < templates.length - 1}
                  trailing={
                    <View style={{ alignItems: 'flex-end', gap: space[1] }}>
                      {t.tier === 'premium' ? <Badge text="Pro" /> : null}
                      <Button
                        title="Use this"
                        variant="secondary"
                        size="compact"
                        accessibilityLabel={t.locked ? `Use example: ${t.name} (Harada Pro)` : `Use example: ${t.name}`}
                        loading={pendingTemplate === t.id}
                        disabled={busy}
                        onPress={() => chooseTemplate(t.id)}
                      />
                    </View>
                  }
                />
                {lockedTemplate === t.id ? (
                  <UpgradePrompt
                    feature="premium_templates"
                    trigger="action"
                    note={`“${t.name}” is one of the Harada Pro examples. The free examples and a blank goal work on any plan.`}
                    onDismiss={() => setLockedTemplate(null)}
                  />
                ) : null}
              </View>
            ))}
          </View>
        </Section>
      ) : null}
    </View>
  );
}
