import { StyleSheet, View } from 'react-native';

import {
  ACHIEVEMENT_CATEGORY_LABELS,
  achievementDefinition,
  formatMemberNumber,
} from '@shared/application/achievements';
import type { PrimaryGoalDTO, ProfileAchievementDTO } from '@shared/application/social';
import { useTheme } from '@/theme';
import { Button, ProgressBar, Text } from '@/ui';

/**
 * Founding Member credential, featured-goal progress and achievements for the profile tab. Same data and
 * definitions as the web profile (src/ui/features/social); every figure comes from the database.
 */
export function FoundingCredential({ number, since }: { number: number; since: string }) {
  const { colors, space } = useTheme();
  const sinceLabel = formatMonthYear(since);
  return (
    <View
      accessible
      accessibilityLabel={`Harada Founding Member ${formatMemberNumber(number)}. Among the first 100 members helping build Harada.`}
      style={{
        borderTopWidth: StyleSheet.hairlineWidth,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: colors.founder,
        paddingVertical: space[4],
        gap: space[1],
      }}
    >
      <Text variant="caption" tone="muted" style={styles.wordmark}>
        HARADA
      </Text>
      <Text variant="caption" style={[styles.eyebrow, { color: colors.founder }]}>
        FOUNDING MEMBER
      </Text>
      <Text variant="title" tabular>
        {formatMemberNumber(number)}
      </Text>
      <Text variant="meta" tone="muted">
        Among the first 100 members helping build Harada.{sinceLabel ? ` Since ${sinceLabel}.` : ''}
      </Text>
    </View>
  );
}

/** Compact mark beside a name. */
export function FoundingMark({ number }: { number: number }) {
  const { colors, space, radius } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`Founding Member ${formatMemberNumber(number)}`}
      style={{
        alignSelf: 'flex-start',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.founder,
        borderRadius: radius.sm,
        paddingHorizontal: space[1] + 2,
      }}
    >
      <Text variant="caption" style={{ color: colors.founder }}>
        Founding {formatMemberNumber(number)}
      </Text>
    </View>
  );
}

export function PrimaryGoalSummary({ goal, hiddenFromOthers }: { goal: PrimaryGoalDTO; hiddenFromOthers?: boolean }) {
  const { space } = useTheme();
  const m = goal.metrics;
  const achieved = goal.status === 'achieved';
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ gap: space[1] }}>
        <Text variant="caption" tone="muted">
          {achieved ? 'GOAL ACHIEVED' : 'CURRENT GOAL'}
        </Text>
        <Text variant="heading">{goal.title}</Text>
        {hiddenFromOthers ? (
          <Text variant="caption" tone="muted">
            Progress figures are hidden from other people.
          </Text>
        ) : null}
      </View>
      {m ? (
        <>
          <ProgressBar
            value={m.tasksTotal > 0 ? (m.tasksCompleted / m.tasksTotal) * 100 : null}
            accessibilityLabel={`Tasks completed, ${m.tasksCompleted} of ${m.tasksTotal}`}
          />
          <View style={styles.metricGrid}>
            <Metric label={achieved ? 'Days to achieve' : 'Days pursuing'} value={m.daysPursuing ?? '—'} />
            <Metric label="Actions completed" value={m.actionsCompleted} />
            <Metric
              label="Consistency"
              value={m.consistency ? `${Math.round(m.consistency.rate * 100)}%` : '—'}
              note={m.consistency ? `${m.consistency.activeDays} of ${m.consistency.windowDays} days` : undefined}
            />
            <Metric
              label="Key areas complete"
              value={m.keyAreasTotal > 0 ? `${m.keyAreasComplete}/${m.keyAreasTotal}` : '—'}
            />
          </View>
          <Text variant="caption" tone="muted">
            Actions: tasks done plus routine check-ins recorded on the day or up to two days after. Consistency: days
            with a completed action in the last 30 days of this goal.
          </Text>
        </>
      ) : null}
    </View>
  );
}

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  const { colors, space } = useTheme();
  return (
    <View
      style={{ width: '50%', paddingVertical: space[2], borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.rule }}
    >
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="heading" tabular>
        {String(value)}
      </Text>
      {note ? (
        <Text variant="caption" tone="muted" tabular>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

export function AchievementRow({
  achievement: a,
  owner,
  onShare,
  onToggleHidden,
}: {
  achievement: ProfileAchievementDTO;
  owner: boolean;
  onShare?: () => void;
  onToggleHidden?: () => void;
}) {
  const { colors, space } = useTheme();
  const def = achievementDefinition(a.key);
  const isFounding = a.key === 'founding_member';
  return (
    <View
      testID={`achievement-${a.key}`}
      style={{
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: isFounding ? colors.founder : colors.rule,
        padding: space[3],
        gap: space[1],
        opacity: owner && a.hidden ? 0.6 : 1,
      }}
    >
      <Text variant="caption" style={{ color: isFounding ? colors.founder : colors.inkMuted }}>
        {def ? ACHIEVEMENT_CATEGORY_LABELS[def.category].toUpperCase() : 'ACHIEVEMENT'}
      </Text>
      <Text variant="headline">{a.title}</Text>
      {a.goal ? <Text variant="meta">{a.goal.title}</Text> : null}
      <Text variant="caption" tone="muted">
        {formatDate(a.earnedAt)} · Verified from activity recorded in Harada
      </Text>
      {owner ? (
        <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[1] }}>
          {a.postId ? (
            <Text variant="caption" tone="muted">
              Shared with the community
            </Text>
          ) : (
            <Button title="Share" size="compact" variant="secondary" disabled={a.hidden} onPress={onShare} />
          )}
          <Button
            title={a.hidden ? 'Show on profile' : 'Hide from profile'}
            size="compact"
            variant="ghost"
            accessibilityLabel={`${a.hidden ? 'Show' : 'Hide'} ${a.title} on my profile`}
            onPress={onToggleHidden}
          />
        </View>
      ) : null}
    </View>
  );
}

function formatMonthYear(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const styles = StyleSheet.create({
  wordmark: { letterSpacing: 4 },
  eyebrow: { letterSpacing: 3 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap' },
});
