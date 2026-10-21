import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { ReflectionDTO } from '@shared/application/dto';
import { useTheme } from '@/theme';
import { Text } from '@/ui';

const ROWS: { key: 'wentWell' | 'didntGoWell' | 'nextChange'; label: string }[] = [
  { key: 'wentWell', label: 'What went well?' },
  { key: 'didntGoWell', label: "What didn't?" },
  { key: 'nextChange', label: 'What will you change?' },
];

export function ReflectionCard({ reflection }: { reflection: ReflectionDTO }) {
  const { colors, radius, space } = useTheme();
  const [open, setOpen] = useState(false);
  const rows = ROWS.filter((r) => reflection[r.key].trim() !== '');
  const long = rows.some((r) => reflection[r.key].length > 160 || reflection[r.key].split('\n').length > 3);
  return (
    <View
      style={{
        gap: space[2],
        padding: space[3],
        borderWidth: 1,
        borderColor: colors.rule,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
      }}
    >
      <Text variant="meta" tone="muted" style={{ fontFamily: 'Inter_600SemiBold' }}>
        {reflection.kind === 'weekly' ? 'Weekly reflection' : 'Daily reflection'}
      </Text>
      {rows.map((r) => (
        <View key={r.key}>
          <Text variant="meta" style={{ fontFamily: 'Inter_500Medium' }}>
            {r.label}
          </Text>
          <Text variant="meta" tone="muted" numberOfLines={open ? undefined : 3}>
            {reflection[r.key]}
          </Text>
        </View>
      ))}
      {long ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? 'Show less' : 'Show more'}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((o) => !o)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text variant="meta" tone="accent" style={{ fontFamily: 'Inter_500Medium' }}>
            {open ? 'Show less' : 'Show more'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
