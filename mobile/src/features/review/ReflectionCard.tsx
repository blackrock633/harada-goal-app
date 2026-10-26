import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ReflectionDTO } from '@shared/application/dto';
import { useTheme } from '@/theme';
import { Button, Text } from '@/ui';
import { formatLocalDate } from '../today/format';
import { answerOf, questionsOf } from './questions';

const KIND_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' } as const;

function heading(r: ReflectionDTO): string {
  if (r.kind === 'weekly') return `Week ending ${formatLocalDate(r.date, 'long')}`;
  if (r.kind === 'monthly') return `Month ending ${formatLocalDate(r.date, 'long')}`;
  return formatLocalDate(r.date, 'long');
}

/**
 * One past reflection as a ruled entry (no card): the date as its title, the kind beside it, the
 * first answer as its meta line, and how many of its questions were answered. "Show more" opens
 * every question, marking the ones left empty.
 */
export function ReflectionCard({ reflection, onEdit }: { reflection: ReflectionDTO; onEdit?: (r: ReflectionDTO) => void }) {
  const { colors, space } = useTheme();
  const [open, setOpen] = useState(false);
  const questions = questionsOf(reflection);
  const rows = questions.map((q) => ({ ...q, text: answerOf(reflection, q.key).trim() }));
  const answered = rows.filter((r) => r.text !== '');
  const first = answered[0];
  const incomplete = answered.length < rows.length;
  const long =
    answered.length > 1 ||
    incomplete ||
    answered.some((r) => r.text.length > 120 || r.text.split('\n').length > 2);
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
          {heading(reflection)}
        </Text>
        <Text variant="caption" tone="muted">
          {KIND_LABEL[reflection.kind]}
        </Text>
        {incomplete ? (
          <Text variant="caption" tone="muted" tabular>
            {`· ${answered.length} of ${rows.length} answered`}
          </Text>
        ) : null}
      </View>
      {open ? (
        rows.map((r) => (
          <View key={r.key} style={{ marginTop: space[1] }}>
            <Text variant="caption" weight="semibold" tone="muted">
              {r.label}
            </Text>
            {r.text ? (
              <Text variant="meta">{r.text}</Text>
            ) : (
              <Text variant="meta" tone="faint">
                Not answered
              </Text>
            )}
          </View>
        ))
      ) : first ? (
        <Text variant="meta" tone="muted" numberOfLines={2}>
          {first.text}
        </Text>
      ) : null}
      {long || onEdit ? (
        <View style={[styles.more, { gap: space[2] }]}>
          {long ? (
            <Button
              title={open ? 'Show less' : 'Show more'}
              variant="ghost"
              size="compact"
              icon={open ? undefined : 'expand'}
              onPress={() => setOpen((o) => !o)}
            />
          ) : null}
          {onEdit ? (
            <Button
              title="Edit"
              variant="ghost"
              size="compact"
              icon="edit"
              accessibilityLabel={`Edit reflection: ${heading(reflection)}`}
              onPress={() => onEdit(reflection)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  more: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'flex-start', marginLeft: -8 },
});
