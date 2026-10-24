import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme, type FontWeight, type TextVariant } from '@/theme';

export type TextTone = 'default' | 'muted' | 'faint' | 'accent' | 'danger' | 'success' | 'warning';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  tone?: TextTone;
  /** UI variants only (headline, body, meta, caption); display variants keep their face. */
  weight?: FontWeight;
  /** Tabular figures, for counts and dates that sit in columns or change in place. */
  tabular?: boolean;
};

const HEADER_VARIANTS: TextVariant[] = ['display', 'title', 'heading'];

export function Text({ variant = 'body', tone = 'default', weight, tabular, style, accessibilityRole, ...rest }: TextProps) {
  const { colors, typeScale, fontWeight } = useTheme();
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
      style={[
        typeScale[variant],
        { color },
        weight && !HEADER_VARIANTS.includes(variant) ? { fontWeight: fontWeight[weight] } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
      {...rest}
    />
  );
}
