import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, useTheme } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

export type FocusToggleProps = {
  /** True when the action is in today's focus. */
  on: boolean;
  onPress?: () => void;
  /** The action's title, for the accessible name ("Today's focus: Weekly long run"). */
  actionTitle: string;
  busy?: boolean;
  /** Focus is full (5 of 5) and this one is off. */
  disabled?: boolean;
  /** icon: just the sun (dense rows on phones). label: sun + "Today". */
  display?: 'label' | 'icon';
  testID?: string;
};

/** Adds an action to today's focus. A switch, not a link: its state shows by fill AND label/icon. */
export function FocusToggle({ on, onPress, actionTitle, busy = false, disabled = false, display = 'label', testID }: FocusToggleProps) {
  const { colors, radius, space } = useTheme();
  const fg = on ? colors.accentOnSoft : colors.inkMuted;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={`Today's focus: ${actionTitle}`}
      accessibilityState={{ checked: on, busy, disabled: disabled || busy }}
      aria-checked={on}
      aria-busy={busy}
      aria-disabled={disabled || busy}
      accessibilityHint={disabled && !on ? 'Today already has 5 focus actions' : undefined}
      disabled={disabled || busy}
      onPress={onPress}
      style={styles.hit}
    >
      {({ pressed }) => (
      <View
        style={[
        styles.pill,
        {
          gap: space[1],
          paddingHorizontal: display === 'icon' ? 0 : space[3],
          width: display === 'icon' ? 32 : undefined,
          borderRadius: radius.full,
          borderColor: on ? colors.accentSoft : colors.ruleStrong,
          backgroundColor: on ? colors.accentSoft : pressed ? colors.surfaceSunken : 'transparent',
          opacity: disabled && !on ? 0.4 : 1,
        },
      ]}
      >
      {busy ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        // On shows a check, off shows the sun: the state reads by shape, not only by fill.
        <Icon name={on ? 'focusOn' : 'focus'} size={15} color={fg} weight={on ? 'semibold' : 'medium'} />
      )}
      {display === 'label' ? (
        <Text variant="caption" weight="semibold" style={{ color: fg }}>
          Today
        </Text>
      ) : null}
      </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The visible pill is 32 pt; the pressable around it meets the touch minimum on every platform.
  hit: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  pill: { minHeight: 32, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
