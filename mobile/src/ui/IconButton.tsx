import { Pressable, StyleSheet } from 'react-native';

import { MIN_TOUCH, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';

export type IconButtonProps = {
  /** Required: icons never carry meaning alone. */
  accessibilityLabel: string;
  onPress?: () => void;
  icon?: IconName;
  /** accent for the screen's own action (e.g. edit); default ink. */
  tone?: 'default' | 'accent' | 'muted';
  disabled?: boolean;
  testID?: string;
};

export function IconButton({ accessibilityLabel, onPress, icon = 'more', tone = 'default', disabled = false, testID }: IconButtonProps) {
  const { colors, radius } = useTheme();
  const color = { default: colors.ink, accent: colors.accent, muted: colors.inkMuted }[tone];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { borderRadius: radius.full, backgroundColor: pressed ? colors.surfaceSunken : 'transparent', opacity: disabled ? 0.4 : 1 },
      ]}
    >
      <Icon name={icon} size={22} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
});
