import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme, type TextVariant } from '@/theme';

export type TextTone = 'default' | 'muted' | 'faint' | 'accent' | 'danger' | 'success' | 'warning';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  tone?: TextTone;
};

const HEADER_VARIANTS: TextVariant[] = ['display', 'title', 'heading'];

export function Text({ variant = 'body', tone = 'default', style, accessibilityRole, ...rest }: TextProps) {
  const { colors, typeScale } = useTheme();
  const color = {
    default: colors.ink,
    muted: colors.inkMuted,
    faint: colors.inkFaint,
    accent: colors.accent,
    danger: colors.danger,
    success: colors.success,
    warning: colors.warning,
  }[tone];
  return (
    <RNText
      accessibilityRole={accessibilityRole ?? (HEADER_VARIANTS.includes(variant) ? 'header' : undefined)}
      style={[typeScale[variant], { color }, style]}
      {...rest}
    />
  );
}
