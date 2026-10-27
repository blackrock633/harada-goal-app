import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from '@/ui';
import { calendarSummary, type CalendarCell } from './format';

const PER_ROW = 10;

/**
 * The 30 days as square cells on the sheet, ten to a row: ink = activity logged that day, open = none,
 * faint = still ahead. Today carries the one vermilion outline. One accessible summary for the whole strip.
 */
export function CalendarStrip({ cells, day }: { cells: CalendarCell[]; day: number }) {
  const { colors, space } = useTheme();
  const rows = [0, 1, 2].map((r) => cells.slice(r * PER_ROW, (r + 1) * PER_ROW));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={calendarSummary(cells, day)} testID="challenge-calendar" style={{ gap: space[2] }}>
      <View style={[styles.frame, { borderColor: colors.ink }]}>
        {rows.map((row, r) => (
          <View key={r} style={[styles.row, r > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule } : null]}>
            {row.map((c, i) => (
              <View
                key={c.day}
                testID={`challenge-day-${c.day}-${c.state}`}
                style={[
                  styles.cell,
                  {
                    borderLeftWidth: i > 0 ? StyleSheet.hairlineWidth : 0,
                    borderLeftColor: colors.rule,
                    backgroundColor: c.state === 'future' ? colors.paper : colors.surface,
                  },
                ]}
              >
                {c.state === 'active' ? <View style={[styles.fill, { backgroundColor: colors.ink }]} /> : null}
                {c.today ? <View style={[StyleSheet.absoluteFill, { borderWidth: 2, borderColor: colors.accent }]} /> : null}
                <Text
                  variant="caption"
                  tabular
                  style={{
                    fontSize: 12,
                    lineHeight: 16,
                    color: c.state === 'active' ? colors.paper : c.state === 'future' ? colors.inkFaint : colors.inkMuted,
                    opacity: c.state === 'future' ? 0.6 : 1,
                  }}
                >
                  {String(c.day)}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={styles.legend} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Legend swatch={<View style={[styles.swatch, { backgroundColor: colors.ink }]} />} label="Activity" />
        <Legend swatch={<View style={[styles.swatch, { borderWidth: 1, borderColor: colors.ruleStrong, backgroundColor: colors.surface }]} />} label="None" />
        <Legend swatch={<View style={[styles.swatch, { borderWidth: 2, borderColor: colors.accent }]} />} label="Today" />
      </View>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: 1.5 },
  row: { flexDirection: 'row' },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  fill: StyleSheet.absoluteFill,
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12 },
});
