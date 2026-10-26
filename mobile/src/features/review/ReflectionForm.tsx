import { useRef, useState } from 'react';
import { View } from 'react-native';

import type { ReflectionDTO } from '@shared/application/dto';
import { addReflectionSchema, updateReflectionSchema } from '@shared/application/schemas';
import type { ReflectionKind, ReviewAnswers } from '@shared/domain/types';
import { errorMessage, newClientId } from '@/data/errors';
import type { ReviewMutations } from '@/data/mutations';
import { useTheme } from '@/theme';
import { Button, DateField, SegmentedControl, Text, TextField } from '@/ui';
import { UpgradePrompt } from '../premium/UpgradePrompt';
import { formatLocalDate } from '../today/format';
import { QUESTIONS, answerOf, isFieldKey, questionsFor, type FieldKey, type QuestionKey } from './questions';

export type ReflectionFormProps = {
  goalId: string;
  /** YYYY-MM-DD; the default value of the date field. */
  today: string;
  addReflection: ReviewMutations['addReflection'];
  /** Needed to edit a past reflection. */
  updateReflection?: ReviewMutations['updateReflection'];
  onSaved?: (reflection: ReflectionDTO) => void;
  /** Harada Pro's advanced reviews (full weekly, monthly). Free when false or absent. */
  advanced?: boolean;
  /**
   * A past reflection to edit instead of writing a new one. Give the form a `key` per reflection
   * so switching to another entry starts from that entry's answers.
   */
  editing?: ReflectionDTO | null;
  /** Leave edit mode (after saving or on Cancel). */
  onDoneEditing?: () => void;
};

/** Kept for callers that list the basic prompts (the Free daily and weekly sets). */
export const REFLECTION_PROMPTS: Record<'daily' | 'weekly', { key: FieldKey; label: string }[]> = {
  daily: QUESTIONS.daily as { key: FieldKey; label: string }[],
  weekly: QUESTIONS.weekly as { key: FieldKey; label: string }[],
};

const KIND_HINT: Record<ReflectionKind, string> = {
  daily: 'A quick check-in on today.',
  weekly: 'Step back and look at the whole week.',
  monthly: 'Look back at the month and check that the plan still fits.',
};

const KIND_NAME: Record<ReflectionKind, string> = { daily: 'daily', weekly: 'weekly', monthly: 'monthly' };

const KINDS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
] as const;

type Values = Partial<Record<QuestionKey, string>>;

/** Where a question's errors land: the three fields by name, Pro answers under `answers.<key>`. */
const errorKey = (k: QuestionKey) => (isFieldKey(k) ? k : `answers.${k}`);

function initialValues(r: ReflectionDTO | null | undefined): Values {
  if (!r) return {};
  const all: QuestionKey[] = ['wentWell', 'didntGoWell', 'nextChange', 'intended', 'completed', 'obstacles', 'learned', 'priorities', 'strategy'];
  return Object.fromEntries(all.map((k) => [k, answerOf(r, k)]));
}

export function ReflectionForm({
  goalId,
  today,
  addReflection,
  updateReflection,
  onSaved,
  advanced = false,
  editing,
  onDoneEditing,
}: ReflectionFormProps) {
  const { space } = useTheme();
  const [kind, setKind] = useState<ReflectionKind>(editing?.kind ?? 'daily');
  const [date, setDate] = useState(editing?.date ?? today);
  const [values, setValues] = useState<Values>(() => initialValues(editing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPro, setNeedsPro] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  // One client id per logical save: reused on retry, replaced after a successful save.
  const clientId = useRef<string | null>(null);
  const inFlight = useRef(false);

  // Editing keeps the entry's kind. On Free, a monthly entry or a full weekly review is edited
  // through its three basic answers; the Pro answers are left exactly as they were (not sent).
  const questions = questionsFor(kind, advanced);
  const locked = !editing && kind === 'monthly' && !advanced;
  const value = (k: QuestionKey) => values[k] ?? '';

  async function submit() {
    if (inFlight.current || locked) return;
    setSaved(false);
    setError(null);
    setNeedsPro(false);
    setFieldErrors({});
    if (!questions.some((q) => value(q.key).trim() !== '')) {
      setError('Write something in at least one box before saving.');
      return;
    }
    const asked = new Set(questions.map((q) => q.key));
    const field = (k: FieldKey) => (asked.has(k) ? value(k).trim() : undefined);
    const answerKeys = questions.map((q) => q.key).filter((k) => !isFieldKey(k));
    // Only the answers this set asks; an empty answer is simply left out.
    const answers: ReviewAnswers | undefined = answerKeys.length
      ? Object.fromEntries(answerKeys.map((k) => [k, value(k).trim()]).filter(([, v]) => v !== ''))
      : undefined;

    let input: Record<string, unknown>;
    let schema: typeof addReflectionSchema | typeof updateReflectionSchema;
    if (editing) {
      // Edits send every asked field, so clearing an answer clears it.
      input = {
        reflectionId: editing.id,
        expectedUpdatedAt: editing.updatedAt,
        date,
        wentWell: field('wentWell'),
        didntGoWell: field('didntGoWell'),
        nextChange: field('nextChange'),
        ...(answers ? { answers } : {}),
      };
      schema = updateReflectionSchema;
    } else {
      clientId.current ??= newClientId();
      input = {
        id: clientId.current,
        goalId,
        date,
        kind,
        wentWell: field('wentWell') || undefined,
        didntGoWell: field('didntGoWell') || undefined,
        nextChange: field('nextChange') || undefined,
        ...(answers && Object.keys(answers).length ? { answers } : {}),
      };
      schema = addReflectionSchema;
    }
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path.map(String).join('.');
        if (k && !fe[k]) fe[k] = issue.message;
      }
      setFieldErrors(fe);
      setError('Please fix the highlighted fields.');
      return;
    }
    if (editing && !updateReflection) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const res = editing
        ? await updateReflection!(input as Parameters<ReviewMutations['updateReflection']>[0])
        : await addReflection(input as Parameters<ReviewMutations['addReflection']>[0]);
      if (res.ok) {
        clientId.current = null;
        setSaved(true);
        if (!editing) setValues({});
        onSaved?.(res.data);
        if (editing) onDoneEditing?.();
      } else if (res.error.code === 'UPGRADE_REQUIRED') {
        // Kept as typed; the prompt explains why it can't be saved on this plan.
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
      inFlight.current = false;
      setSaving(false);
    }
  }

  const answered = questions.filter((q) => value(q.key).trim() !== '').length;

  return (
    <View style={{ gap: space[5] }}>
      {editing ? (
        <View style={{ gap: space[2] }}>
          <Text variant="body" weight="medium">
            {`Editing your ${KIND_NAME[editing.kind]} reflection from ${formatLocalDate(editing.date, 'long')}`}
          </Text>
          <View style={{ alignItems: 'flex-start', marginLeft: -8 }}>
            <Button title="Cancel editing" variant="ghost" size="compact" disabled={saving} onPress={() => onDoneEditing?.()} />
          </View>
        </View>
      ) : (
        <SegmentedControl
          label="Reflection type"
          options={KINDS}
          value={kind}
          onChange={(k) => {
            if (!saving) setKind(k);
          }}
        />
      )}
      <Text variant="meta" tone="muted">
        {KIND_HINT[kind]}
        {questions.length > 3 ? ' Answer what helps; you can leave any question empty.' : ''}
      </Text>
      {locked ? (
        <UpgradePrompt
          feature="advanced_reviews"
          trigger="gate"
          note="Monthly reviews are part of Harada Pro. Daily and weekly reflections stay free."
        />
      ) : (
        <>
          <DateField
            label={kind === 'weekly' ? 'Week ending' : kind === 'monthly' ? 'Month ending' : 'Date'}
            value={date}
            onChange={setDate}
            max={today}
            error={fieldErrors.date}
          />
          {questions.map((q, i) => (
            <TextField
              key={q.key}
              label={questions.length > 3 ? `${i + 1}. ${q.label}` : q.label}
              value={value(q.key)}
              onChangeText={(t) => setValues((v) => ({ ...v, [q.key]: t }))}
              error={fieldErrors[errorKey(q.key)]}
              editable={!saving}
              multiline
            />
          ))}
          {questions.length > 3 ? (
            <Text variant="caption" tone="muted" tabular>
              {`${answered} of ${questions.length} answered`}
            </Text>
          ) : null}
          {error ? (
            <Text variant="body" tone="danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          {needsPro ? (
            <UpgradePrompt
              feature="advanced_reviews"
              trigger="action"
              note="Your answers are still here, but this review needs Harada Pro to save."
              onDismiss={() => setNeedsPro(false)}
            />
          ) : null}
          {saved && !error ? (
            <Text variant="body" tone="success" accessibilityLiveRegion="polite">
              Reflection saved.
            </Text>
          ) : null}
          <Button
            title={editing ? 'Save changes' : 'Save reflection'}
            onPress={() => void submit()}
            loading={saving}
            style={{ alignSelf: 'flex-start', minWidth: 180 }}
          />
          {kind === 'weekly' && !advanced && !editing ? <UpgradePrompt feature="advanced_reviews" /> : null}
        </>
      )}
    </View>
  );
}
