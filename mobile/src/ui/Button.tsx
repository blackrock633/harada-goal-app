import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { MIN_TOUCH, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = {
  title: string;
  onPress?: () => void;
  /**
   * primary: the one action a screen exists for (at most one per view).
   * secondary: hairline outline, for real alternatives. ghost: inline text action in accent.
   * danger: destructive confirmation only.
   */
  variant?: ButtonVariant;
  /** Leading icon from the app's icon set. */
  icon?: IconName;
  /** compact: 36 pt visual height inside rows; hitSlop keeps the hit area at the touch minimum
   * (web has no hitSlop, so compact keeps the full height there). */
  size?: 'regular' | 'compact';
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
  icon,
  size = 'regular',
  loading = false,
  disabled = false,
  accessibilityLabel,
  testID,
  style,
}: ButtonProps) {
  const { colors, radius, space } = useTheme();
  const inactive = disabled || loading;
  const compact = size === 'compact';

  const palette = {
    primary: { bg: colors.accent, fg: colors.accentInk, border: colors.accent, pressed: colors.accentOnSoft },
    secondary: { bg: 'transparent', fg: colors.ink, border: colors.ruleStrong, pressed: colors.surfaceSunken },
    ghost: { bg: 'transparent', fg: colors.accent, border: 'transparent', pressed: colors.accentSoft },
    danger: { bg: 'transparent', fg: colors.danger, border: colors.danger, pressed: colors.surfaceSunken },
  }[variant];

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ busy: loading, disabled: inactive }}
      aria-busy={loading}
      aria-disabled={inactive}
      disabled={inactive}
      onPress={onPress}
      hitSlop={compact ? (MIN_TOUCH - 36) / 2 : undefined}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: compact && Platform.OS !== 'web' ? 36 : MIN_TOUCH,
          backgroundColor: pressed && !inactive ? palette.pressed : palette.bg,
          borderColor: palette.border,
          borderRadius: radius.md,
          paddingHorizontal: variant === 'ghost' ? space[2] : compact ? space[3] : space[5],
          opacity: disabled && !loading ? 0.4 : 1,
        },
        style,
      ]}
    >
      {/* The label always renders so the width never changes while loading. */}
      <View style={[styles.label, { gap: space[2], opacity: loading ? 0 : 1 }]}>
        {icon ? <Icon name={icon} size={compact ? 16 : 18} color={palette.fg} weight="semibold" /> : null}
        <Text variant={compact ? 'meta' : 'body'} weight="semibold" style={{ color: palette.fg }}>
          {title}
        </Text>
      </View>
      {loading ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.spinner}>
            <View
              style={{
                width: compact ? 28 : 44,
                height: compact ? 8 : 10,
                borderRadius: radius.sm,
                backgroundColor: palette.fg,
                opacity: 0.35,
              }}
            />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flexDirection: 'row', alignItems: 'center' },
  spinner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
