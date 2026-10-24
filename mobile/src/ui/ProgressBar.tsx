import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type ProgressBarProps = {
  /** Percent 0-100, or null when progress cannot be measured yet. */
  value: number | null;
  /** Accessible name, e.g. "Routines kept". */
  accessibilityLabel: string;
  /** Hide the percentage line when the caller already states the value in words. */
  showValue?: boolean;
};

export const NOT_MEASURABLE = 'Not measurable yet';

/** A ruled measure, not a pill: hairline track, ink fill. Used only where the value is real. */
export function ProgressBar({ value, accessibilityLabel, showValue = true }: ProgressBarProps) {
  const { colors, space } = useTheme();
  const pct = value == null ? null : Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={pct == null ? { text: NOT_MEASURABLE } : { min: 0, max: 100, now: pct, text: `${pct}%` }}
      style={{ gap: space[1] }}
    >
      <View style={[styles.track, { backgroundColor: colors.rule }]}>
        {pct != null ? <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors.ink }]} /> : null}
      </View>
      {showValue ? (
        <Text variant="caption" tone="muted" tabular>
          {pct == null ? NOT_MEASURABLE : `${pct}%`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 3, overflow: 'hidden' },
  fill: { height: 3 },
});
