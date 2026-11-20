import { Pressable, StyleSheet, View } from 'react-native';

import { MAX_SCHEDULE_DATES } from '@shared/domain/limits';
import { ordinal, shortDate } from '@shared/application/schedule-text';
import { useTheme } from '@/theme';
import { DateField, IconButton, Text } from '@/ui';

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/** Days 1–31 as a 7-column grid. Selected days are filled (shape, not just colour) and announced as checked. */
export function MonthDayGrid({ selected, onToggle, disabled }: { selected: number[]; onToggle: (day: number) => void; disabled?: boolean }) {
  const { colors, radius, space } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="meta" weight="medium" tone="muted">
        Days of the month
      </Text>
      <View accessibilityRole="list" style={styles.grid}>
        {DAYS.map((d) => {
          const on = selected.includes(d);
          return (
            <View key={d} style={styles.cell}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={`The ${ordinal(d)}`}
                accessibilityState={{ checked: on, disabled }}
                disabled={disabled}
                onPress={() => onToggle(d)}
                style={{
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: on ? colors.accent : colors.rule,
                  backgroundColor: on ? colors.accent : 'transparent',
                }}
              >
                <Text variant="meta" tabular weight={on ? 'semibold' : 'regular'} style={{ color: on ? colors.accentInk : colors.ink }}>
                  {d}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
      <Text variant="caption" tone="muted">
        In shorter months, the 29th to 31st fall on the last day.
      </Text>
    </View>
  );
}

/** The chosen dates, each removable, and a picker to add another (from today on). */
export function DateList({
  dates,
  onAdd,
  onRemove,
  today,
  disabled,
}: {
  dates: string[];
  onAdd: (date: string) => void;
  onRemove: (date: string) => void;
  today: string;
  disabled?: boolean;
}) {
  const { colors, space } = useTheme();
  const year = Number(today.slice(0, 4));
  const full = dates.length >= MAX_SCHEDULE_DATES;
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="meta" weight="medium" tone="muted">
        Dates
      </Text>
      {dates.length === 0 ? (
        <Text variant="meta" tone="muted">
          No dates yet. Add the days this routine happens.
        </Text>
      ) : (
        <View>
          {dates.map((d, i) => (
            <View
              key={d}
              style={[
                styles.row,
                { borderBottomWidth: i < dates.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.rule },
              ]}
            >
              <Text tabular style={{ flex: 1 }}>
                {shortDate(d, year)}
              </Text>
              <IconButton icon="close" tone="muted" accessibilityLabel={`Remove ${shortDate(d, year)}`} disabled={disabled} onPress={() => onRemove(d)} />
            </View>
          ))}
        </View>
      )}
      {full ? (
        <Text variant="caption" tone="muted">
          {`Up to ${MAX_SCHEDULE_DATES} dates.`}
        </Text>
      ) : (
        <DateField label="Add a date" value="" min={today} onChange={(v) => v && onAdd(v)} placeholder="Choose a date" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -2 },
  cell: { width: `${100 / 7}%`, padding: 2 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
});
