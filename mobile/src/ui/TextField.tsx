import { useEffect, useState, type ComponentRef, type Ref } from 'react';
import { AccessibilityInfo, TextInput, View, type TextInputProps } from 'react-native';

import { MIN_TOUCH, useTheme } from '@/theme';

import { Text } from './Text';

/** The focusable instance behind a TextField (RN 0.88 separates component and instance types). */
export type TextFieldHandle = ComponentRef<typeof TextInput>;

export type TextFieldProps = Omit<
  TextInputProps,
  'value' | 'onChangeText' | 'accessibilityLabel' | 'multiline'
> & {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  hint?: string;
  error?: string | null;
  multiline?: boolean;
  /** Show a counter once the value reaches 80% of this limit. */
  maxLength?: number;
  /** React 19 passes `ref` as a prop; forwarded to the TextInput so forms can focus a field. */
  ref?: Ref<TextFieldHandle>;
};

export function TextField({
  label,
  value,
  onChangeText,
  hint,
  error,
  multiline = false,
  maxLength,
  style,
  onFocus,
  onBlur,
  ref,
  ...rest
}: TextFieldProps) {
  const { colors, radius, space, typeScale } = useTheme();
  const [focused, setFocused] = useState(false);

  // Screen readers do not re-read a field when an error appears, so announce it.
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(`${label}: ${error}`);
  }, [error, label]);

  const showCounter = maxLength != null && value.length >= Math.floor(maxLength * 0.8);
  const borderColor = error ? colors.danger : focused ? colors.accent : colors.ruleInput;
  const borderWidth = focused || error ? 2 : 1;
  // iOS draws a single-line TextInput's text below its box when it has a lineHeight (RN bug), so
  // only multiline fields take the body line height.
  const { lineHeight, ...bodyFont } = typeScale.body;
  const font = multiline ? { ...bodyFont, lineHeight } : bodyFont;

  return (
    <View style={{ gap: space[1] }}>
      <Text variant="meta" weight="medium" tone="muted">
        {label}
      </Text>
      <TextInput
        {...rest}
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        maxLength={maxLength}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        aria-invalid={error ? true : undefined}
        placeholderTextColor={colors.inkFaint}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          font,
          {
            color: colors.ink,
            backgroundColor: colors.surface,
            borderColor,
            borderRadius: radius.md,
            borderWidth,
            // The thicker focus border eats into the padding, so the text never shifts.
            paddingHorizontal: space[3] - (borderWidth - 1),
            paddingVertical: 10 - (borderWidth - 1),
            minHeight: multiline ? 112 : MIN_TOUCH,
          },
          style,
        ]}
      />
      {hint && !error ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {showCounter ? (
        <Text variant="caption" tone="muted" tabular style={{ textAlign: 'right' }}>
          {`${value.length} / ${maxLength}`}
        </Text>
      ) : null}
    </View>
  );
}
