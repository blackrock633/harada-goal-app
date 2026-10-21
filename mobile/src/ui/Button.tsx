import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { MIN_TOUCH, useTheme } from '@/theme';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** Keeps the button's width, shows a spinner, and reports busy + disabled. */
  loading?: boolean;
  disabled?: boolean;
  /** Defaults to `title`. */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityLabel,
  testID,
  style,
}: ButtonProps) {
  const { colors, radius, space } = useTheme();
  const inactive = disabled || loading;

  const palette = {
    primary: { bg: colors.accent, fg: colors.accentInk, border: colors.accent },
    secondary: { bg: 'transparent', fg: colors.ink, border: colors.ruleInput },
    ghost: { bg: 'transparent', fg: colors.accent, border: 'transparent' },
    danger: { bg: 'transparent', fg: colors.danger, border: colors.danger },
  }[variant];

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ busy: loading, disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderRadius: radius.sm,
          paddingHorizontal: space[4],
          opacity: disabled && !loading ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {/* The label always renders so the width never changes while loading. */}
      <Text
        variant="body"
        style={{ color: palette.fg, fontFamily: 'Inter_600SemiBold', opacity: loading ? 0 : 1 }}
      >
        {title}
      </Text>
      {loading ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.spinner}>
            <ActivityIndicator color={palette.fg} />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH,
    paddingVertical: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
