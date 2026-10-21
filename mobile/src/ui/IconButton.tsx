import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, useTheme } from '@/theme';

export type IconButtonProps = {
  /** Required: icons never carry meaning alone. */
  accessibilityLabel: string;
  onPress?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  testID?: string;
};

/** Three horizontal dots drawn with views (no icon font dependency). */
export function DotsIcon() {
  const { colors } = useTheme();
  return (
    <View style={styles.dots}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.dot, { backgroundColor: colors.ink }]} />
      ))}
    </View>
  );
}

export function IconButton({ accessibilityLabel, onPress, icon, disabled = false, testID }: IconButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.base, { opacity: disabled ? 0.45 : pressed ? 0.6 : 1 }]}
    >
      {icon ?? <DotsIcon />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
