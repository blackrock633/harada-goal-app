import { createElement, useState } from 'react';
import { View } from 'react-native';

import { MIN_TOUCH, useTheme } from '@/theme';

import { Button } from './Button';
import type { DateFieldProps } from './DateField';
import { Text } from './Text';

export type { DateFieldProps } from './DateField';

/** Web: the browser's own date input, styled to match the native field. */
export function DateField({ label, value, onChange, hint, error, min, max, clearable = false, placeholder = 'Choose a date', testID }: DateFieldProps) {
  const { colors, radius, space, typeScale, scheme } = useTheme();
  // An empty date input shows today's date in grey, which reads as a value. Show a real
  // placeholder until the field is focused or has a date.
  const [focused, setFocused] = useState(false);
  const showPicker = focused || value !== '';
  return (
    <View style={{ gap: space[1] }}>
      <Text variant="meta" weight="medium" tone="muted">
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        {createElement('input', {
          type: showPicker ? 'date' : 'text',
          value,
          placeholder: showPicker ? undefined : placeholder,
          readOnly: !showPicker,
          onFocus: () => setFocused(true),
          onBlur: () => setFocused(false),
          min,
          max,
          'data-testid': testID,
          'aria-label': label,
          'aria-invalid': error ? true : undefined,
          onChange: (e: { target: { value: string } }) => onChange(e.target.value),
          style: {
            flex: 1,
            minHeight: MIN_TOUCH,
            boxSizing: 'border-box',
            padding: `0 ${space[3]}px`,
            borderRadius: radius.md,
            border: `${error || focused ? 2 : 1}px solid ${error ? colors.danger : focused ? colors.focus : colors.ruleInput}`,
            outline: 'none',
            background: colors.surface,
            color: value ? colors.ink : colors.inkFaint,
            colorScheme: scheme,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: typeScale.body.fontSize,
            fontVariantNumeric: 'tabular-nums',
            accentColor: colors.accent,
          },
        })}
        {clearable && value ? <Button title="Clear" variant="ghost" onPress={() => onChange('')} /> : null}
      </View>
      {hint && !error ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
