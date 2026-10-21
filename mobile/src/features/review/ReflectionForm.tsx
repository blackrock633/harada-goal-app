import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { ReflectionDTO } from '@shared/application/dto';
import { addReflectionSchema } from '@shared/application/schemas';
import { errorMessage, newClientId } from '@/data/errors';
import type { ReviewMutations } from '@/data/mutations';
import { MIN_TOUCH, useTheme } from '@/theme';
import { Button, Text, TextField } from '@/ui';

export type ReflectionFormProps = {
  goalId: string;
  /** YYYY-MM-DD; the default value of the date field. */
  today: string;
  addReflection: ReviewMutations['addReflection'];
  onSaved?: (reflection: ReflectionDTO) => void;
};

type FieldKey = 'wentWell' | 'didntGoWell' | 'nextChange';

export const REFLECTION_PROMPTS: { key: FieldKey; label: string }[] = [
  { key: 'wentWell', label: 'What went well?' },
  { key: 'didntGoWell', label: "What didn't?" },
  { key: 'nextChange', label: 'What will you change?' },
];

const EMPTY: Record<FieldKey, string> = { wentWell: '', didntGoWell: '', nextChange: '' };

export function ReflectionForm({ goalId, today, addReflection, onSaved }: ReflectionFormProps) {
  const { colors, radius, space } = useTheme();
  const [kind, setKind] = useState<'daily' | 'weekly'>('daily');
  const [date, setDate] = useState(today);
  const [values, setValues] = useState<Record<FieldKey, string>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  // One client id per logical save: reused on retry, replaced after a successful save.
  const clientId = useRef<string | null>(null);
  const inFlight = useRef(false);

  async function submit() {
    if (inFlight.current) return;
    setSaved(false);
    setError(null);
    setFieldErrors({});
    if (!REFLECTION_PROMPTS.some((p) => values[p.key].trim() !== '')) {
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
    inFlight.current = true;
    setSaving(true);
    try {
      const res = await addReflection(input);
      if (res.ok) {
        setValues(EMPTY);
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
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: space[4] }}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Reflection type"
        style={{
          flexDirection: 'row',
          alignSelf: 'flex-start',
          borderWidth: 1,
          borderColor: colors.ruleStrong,
          borderRadius: radius.sm,
          overflow: 'hidden',
        }}
      >
        {(['daily', 'weekly'] as const).map((k) => {
          const label = k === 'daily' ? 'Daily' : 'Weekly';
          const selected = kind === k;
          return (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ checked: selected, disabled: saving }}
              disabled={saving}
              onPress={() => setKind(k)}
              style={{
                minHeight: MIN_TOUCH,
                minWidth: MIN_TOUCH,
                paddingHorizontal: space[4],
                justifyContent: 'center',
                backgroundColor: selected ? colors.accent : colors.surface,
              }}
            >
              <Text variant="meta" style={{ color: selected ? colors.accentInk : colors.ink, fontFamily: 'Inter_500Medium' }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <TextField
        label="Date"
        value={date}
        onChangeText={setDate}
        hint="YYYY-MM-DD"
        error={fieldErrors.date}
        editable={!saving}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="numbers-and-punctuation"
      />
      {REFLECTION_PROMPTS.map((p) => (
        <TextField
          key={p.key}
          label={p.label}
          value={values[p.key]}
          onChangeText={(t) => setValues((v) => ({ ...v, [p.key]: t }))}
          error={fieldErrors[p.key]}
          editable={!saving}
          multiline
        />
      ))}
      {error ? (
        <Text variant="body" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {saved && !error ? (
        <Text variant="body" tone="success" accessibilityLiveRegion="polite">
          Reflection saved.
        </Text>
      ) : null}
      <Button title="Save reflection" onPress={() => void submit()} loading={saving} />
    </View>
  );
}
