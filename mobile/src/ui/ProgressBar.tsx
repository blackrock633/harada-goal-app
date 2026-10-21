import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type ProgressBarProps = {
  /** Percent 0-100, or null when progress cannot be measured yet. */
  value: number | null;
  /** Accessible name, e.g. "Goal progress". */
  accessibilityLabel: string;
};

export const NOT_MEASURABLE = 'Not measurable yet';

export function ProgressBar({ value, accessibilityLabel }: ProgressBarProps) {
  const { colors, radius, space } = useTheme();
  const pct = value == null ? null : Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={pct == null ? { text: NOT_MEASURABLE } : { min: 0, max: 100, now: pct, text: `${pct}%` }}
      style={{ gap: space[1] }}
    >
      <View style={[styles.track, { backgroundColor: colors.surfaceSunken, borderRadius: radius.full }]}>
        {pct != null ? (
          <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors.accent, borderRadius: radius.full }]} />
        ) : null}
      </View>
      <Text variant="meta" tone="muted">
        {pct == null ? NOT_MEASURABLE : `${pct}%`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, overflow: 'hidden' },
  fill: { height: 6 },
});
