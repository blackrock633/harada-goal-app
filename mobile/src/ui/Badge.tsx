import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Text, type TextTone } from './Text';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export type BadgeProps = {
  /** Status is always conveyed as text, never by colour alone. */
  text: string;
  tone?: BadgeTone;
};

const TEXT_TONE: Record<BadgeTone, TextTone> = {
  neutral: 'muted',
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

export function Badge({ text, tone = 'neutral' }: BadgeProps) {
  const { colors, radius, space } = useTheme();
  const border = {
    neutral: colors.ruleStrong,
    accent: colors.accent,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
  }[tone];
  return (
    <View
      accessible
      accessibilityLabel={text}
      style={{
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: border,
        borderRadius: radius.full,
        paddingHorizontal: space[2],
        paddingVertical: 2,
      }}
    >
      <Text variant="meta" tone={TEXT_TONE[tone]} style={{ fontFamily: 'Inter_500Medium' }}>
        {text}
      </Text>
    </View>
  );
}
