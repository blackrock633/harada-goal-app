import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ReflectionDTO } from '@shared/application/dto';
import { useTheme } from '@/theme';
import { Button, Text } from '@/ui';
import { formatLocalDate } from '../today/format';

const ROWS: { key: 'wentWell' | 'didntGoWell' | 'nextChange'; label: string }[] = [
  { key: 'wentWell', label: 'What went well?' },
  { key: 'didntGoWell', label: "What didn't?" },
  { key: 'nextChange', label: 'What will you change?' },
];

/**
 * One past reflection as a ruled entry (no card): the date as its title, the kind beside it, the
 * first answer as its meta line. "Show more" opens every answer.
 */
export function ReflectionCard({ reflection }: { reflection: ReflectionDTO }) {
  const { colors, space } = useTheme();
  const [open, setOpen] = useState(false);
  const rows = ROWS.filter((r) => reflection[r.key].trim() !== '');
  const first = rows[0];
  const long =
    rows.length > 1 ||
    rows.some((r) => reflection[r.key].length > 120 || reflection[r.key].split('\n').length > 2);
  return (
    <View
      style={{
        gap: space[1],
        paddingVertical: space[3],
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.rule,
      }}
    >
      <View style={[styles.head, { gap: space[2] }]}>
        <Text variant="body" weight="medium" tabular>
          {formatLocalDate(reflection.date, 'long')}
        </Text>
        <Text variant="caption" tone="muted">
          {reflection.kind === 'weekly' ? 'Weekly' : 'Daily'}
        </Text>
      </View>
      {open ? (
        rows.map((r) => (
          <View key={r.key} style={{ marginTop: space[1] }}>
            <Text variant="caption" weight="semibold" tone="muted">
              {r.label}
            </Text>
            <Text variant="meta">{reflection[r.key]}</Text>
          </View>
        ))
      ) : first ? (
        <Text variant="meta" tone="muted" numberOfLines={2}>
          {reflection[first.key]}
        </Text>
      ) : null}
      {long ? (
        <View style={styles.more}>
          <Button
            title={open ? 'Show less' : 'Show more'}
            variant="ghost"
            size="compact"
            icon={open ? undefined : 'expand'}
            onPress={() => setOpen((o) => !o)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  more: { alignSelf: 'flex-start', marginLeft: -8 },
});
