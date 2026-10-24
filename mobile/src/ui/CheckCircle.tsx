import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, useTheme } from '@/theme';

import { Icon } from './Icon';

export type CheckCircleProps = {
  checked: boolean;
  /** Callers pass the action, e.g. "Complete: Write chapter 1". */
  accessibilityLabel: string;
  onPress?: () => void;
  busy?: boolean;
  disabled?: boolean;
  /** Routines are squares (a check sheet box); tasks are circles. Shape, not colour, tells them apart. */
  shape?: 'circle' | 'square';
  testID?: string;
};

const MARK = 26;

export function CheckCircle({ checked, accessibilityLabel, onPress, busy = false, disabled = false, shape = 'circle', testID }: CheckCircleProps) {
  const { colors, radius } = useTheme();
  const inactive = disabled || busy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, busy, disabled: inactive }}
      aria-checked={checked}
      aria-busy={busy}
      aria-disabled={inactive}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.hit, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View
        style={[
          styles.mark,
          {
            borderRadius: shape === 'circle' ? MARK / 2 : radius.sm,
            borderColor: checked ? colors.accent : colors.ruleInput,
            backgroundColor: checked ? colors.accent : 'transparent',
            opacity: disabled && !busy ? 0.4 : 1,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={checked ? colors.accentInk : colors.accent} />
        ) : checked ? (
          <Icon name="check" size={15} color={colors.accentInk} weight="semibold" />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  mark: {
    width: MARK,
    height: MARK,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
