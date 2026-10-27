import { Pressable, StyleSheet, View } from 'react-native';

import type { Enrollment } from '@/data/premium';
import { MIN_TOUCH, useTheme } from '@/theme';
import { Icon, Text } from '@/ui';
import { CHALLENGE_DAYS, activeEnrollment, dayOf } from './format';

/** The line Today shows for the challenge: where you are when one runs, an invitation otherwise. */
export function challengeEntryLabel(enrollments: Enrollment[] | undefined, today: string): { label: string; active: boolean } {
  const e = activeEnrollment(enrollments);
  if (!e) return { label: 'Try the 30-Day Challenge', active: false };
  const day = dayOf(e, today);
  return { label: day === 0 ? '30-Day Challenge · starts soon' : `30-Day Challenge · Day ${day} of ${CHALLENGE_DAYS}`, active: true };
}

/** A quiet ruled row on Today; never blocks the screen (renders nothing until enrollments load). */
export function ChallengeEntry({
  enrollments,
  today,
  onPress,
}: {
  enrollments: Enrollment[] | undefined;
  today: string;
  onPress: () => void;
}) {
  const { colors, space } = useTheme();
  if (!enrollments) return null;
  const { label, active } = challengeEntryLabel(enrollments, today);
  return (
    <Pressable
      testID="challenge-entry"
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={active ? 'Opens your challenge' : 'Thirty days focused on one goal'}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { gap: space[2], borderTopColor: colors.rule, borderBottomColor: colors.rule, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name="date" size={18} color={colors.inkMuted} />
      <View style={{ flex: 1 }}>
        <Text variant="meta" tone={active ? 'default' : 'muted'} weight={active ? 'medium' : undefined} tabular>
          {label}
        </Text>
      </View>
      <Icon name="forward" size={14} color={colors.inkFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
