import { useState, type Ref } from 'react';
import { View } from 'react-native';

import { Button, Section, Text, TextField, type TextFieldHandle } from '@/ui';
import { useTheme } from '@/theme';

import {
  FIELD_LIMITS,
  PURPOSE_FIELDS,
  criteriaNeedsSignal,
  type FieldErrors,
  type FieldKey,
  type GoalDraft,
  type PurposeKey,
} from './goalLogic';

export type DetailsFieldsProps = {
  draft: GoalDraft;
  errors: FieldErrors;
  disabled?: boolean;
  onChange: (patch: Partial<Pick<GoalDraft, 'vision' | 'successCriteria'>>) => void;
  onChangePurpose: (key: PurposeKey, value: string) => void;
  /** Lets the owning form focus the first invalid field (A11Y-02). */
  register?: (key: FieldKey) => Ref<TextFieldHandle>;
};

/** Success criteria, vision and the four purpose quadrants (shared by the form and onboarding). */
export function DetailsFields({ draft, errors, disabled, onChange, onChangePurpose, register }: DetailsFieldsProps) {
  const { space } = useTheme();
  const hasExtra = PURPOSE_FIELDS.slice(1).some((f) => draft.purpose[f.key].trim() || errors[f.key]);
  const [open, setOpen] = useState(false);
  const expanded = open || hasExtra;
  const visible = expanded ? PURPOSE_FIELDS : PURPOSE_FIELDS.slice(0, 1);
  const showHint = !errors.successCriteria && criteriaNeedsSignal(draft.successCriteria);

  return (
    <View style={{ gap: space[5] }}>
      <Section title="Success and vision">
      <View style={{ gap: space[2] }}>
        <TextField
          label="How you'll know you've succeeded (optional)"
          hint="Something observable: a number, a date, or something someone else would notice. Include where you're starting from if it helps."
          value={draft.successCriteria}
          ref={register?.('successCriteria')}
          onChangeText={(v) => onChange({ successCriteria: v })}
          error={errors.successCriteria}
          editable={!disabled}
          multiline
          maxLength={FIELD_LIMITS.successCriteria}
        />
        {showHint ? (
          <Text variant="meta" tone="muted" testID="criteria-hint">
            Tip: this reads as qualitative, which is fine. If you can, add one thing you could observe, such as a
            number or a date. You can set measurable targets per key area later.
          </Text>
        ) : null}
      </View>

      <TextField
        label="Vision (optional)"
        hint="The picture of the future, and why this goal matters to you."
        value={draft.vision}
        ref={register?.('vision')}
        onChangeText={(v) => onChange({ vision: v })}
        error={errors.vision}
        editable={!disabled}
        multiline
        maxLength={FIELD_LIMITS.vision}
      />
      </Section>

      <Section
        title="Why it matters"
      >
        {visible.map((f) => (
          <TextField
            key={f.key}
            label={f.label}
            hint={f.hint}
            value={draft.purpose[f.key]}
            ref={register?.(f.key)}
            onChangeText={(v) => onChangePurpose(f.key, v)}
            error={errors[f.key]}
            editable={!disabled}
            multiline
            maxLength={FIELD_LIMITS.purpose}
          />
        ))}
        {!expanded ? (
          <View style={{ alignItems: 'flex-start' }}>
            <Button title="Add more reasons" variant="ghost" onPress={() => setOpen(true)} />
          </View>
        ) : null}
      </Section>
    </View>
  );
}
