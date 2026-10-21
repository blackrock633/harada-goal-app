import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, useTheme } from '@/theme';

export type CheckCircleProps = {
  checked: boolean;
  /** Callers pass the action, e.g. "Complete: Write chapter 1". */
  accessibilityLabel: string;
  onPress?: () => void;
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
};

const CIRCLE = 28;

export function CheckCircle({ checked, accessibilityLabel, onPress, busy = false, disabled = false, testID }: CheckCircleProps) {
  const { colors } = useTheme();
  const inactive = disabled || busy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, busy, disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={styles.hit}
    >
      <View
        style={[
          styles.circle,
          {
            borderColor: checked ? colors.accent : colors.ruleInput,
            backgroundColor: checked ? colors.accent : 'transparent',
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={checked ? colors.accentInk : colors.accent} />
        ) : checked ? (
          <View style={[styles.tick, { borderColor: colors.accentInk }]} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    width: 8,
    height: 14,
    borderRightWidth: 2.5,
    borderBottomWidth: 2.5,
    transform: [{ rotate: '45deg' }, { translateY: -1 }],
  },
});
