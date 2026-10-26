import { useState } from 'react';
import { View } from 'react-native';

import type { GoalSummaryDTO } from '@shared/application/dto';
import type { Enrollment } from '@/data/premium';
import { useTheme } from '@/theme';
import { Badge, Button, ListRow, Screen, Section, Text } from '@/ui';
import { CheckRow, RadioRow } from './controls';
import { CHALLENGE_DAYS, challengeWindow, longDate, shortDate } from './format';
import { useJoinChallenge } from './useJoinChallenge';

export type ChallengeLandingProps = {
  goals: GoalSummaryDTO[];
  /** The user's local date (profile time zone). */
  today: string;
  /** Finished or left enrollments, newest first. */
  history: Enrollment[];
  onJoined: (enrollment: { id: string }) => void;
  onCreateGoal: () => void;
  onOpenGoal: (goalId: string) => void;
  onOpenReport: (enrollmentId: string) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export const COMMITMENT = 'I commit to working on this goal every day for 30 days';

const STEPS = [
  { title: 'Every day', meta: 'Complete the actions you planned for today, and note any obstacle in a short reflection.' },
  { title: 'Every week', meta: 'Write a weekly review on days 7, 14, 21 and 28: what moved, what got in the way, what to change.' },
  { title: 'On day 30', meta: 'A report built from what you logged, plus your own account of what you achieved.' },
];

/** What the challenge is and how to join it; shown when the user has no running challenge. */
export function ChallengeLanding({
  goals,
  today,
  history,
  onJoined,
  onCreateGoal,
  onOpenGoal,
  onOpenReport,
  refreshing,
  onRefresh,
}: ChallengeLandingProps) {
  const { space } = useTheme();
  const active = goals.filter((g) => g.status === 'active');
  const drafts = goals.filter((g) => g.status === 'draft');
  const [picked, setPicked] = useState<string | null>(active.length === 1 ? active[0]!.id : null);
  const goalId = picked && active.some((g) => g.id === picked) ? picked : null;
  const [committed, setCommitted] = useState(false);
  const { join, busy, error } = useJoinChallenge(onJoined);
  const { start, end } = challengeWindow(today);
  const titleOf = (id: string) => goals.find((g) => g.id === id)?.title ?? 'A goal';

  const joinBody =
    goals.length === 0 ? (
      <>
        <Text variant="body" tone="muted">
          The challenge works on one goal. Set your goal first; you can start the challenge as soon as it is active.
        </Text>
        <View style={{ alignItems: 'flex-start' }}>
          <Button title="Create a goal" onPress={onCreateGoal} />
        </View>
      </>
    ) : active.length === 0 ? (
      <>
        <Text variant="body" tone="muted">
          {drafts.length > 0
            ? `"${drafts[0]!.title}" is still a draft. Start the goal first: the challenge runs on an active goal.`
            : 'You have no active goal. Activate or create a goal first: the challenge runs on an active goal.'}
        </Text>
        <View style={{ alignItems: 'flex-start' }}>
          {drafts.length > 0 ? (
            <Button title="Open goal" onPress={() => onOpenGoal(drafts[0]!.id)} />
          ) : (
            <Button title="Create a goal" onPress={onCreateGoal} />
          )}
        </View>
      </>
    ) : (
      <>
        <View accessibilityRole="radiogroup" accessibilityLabel="Goal for the challenge">
          <Text variant="headline" style={{ marginBottom: space[1] }}>
            Choose the goal
          </Text>
          {active.map((g, i) => (
            <RadioRow
              key={g.id}
              label={g.title}
              meta={`${g.outcomeCount} key ${g.outcomeCount === 1 ? 'area' : 'areas'} · ${g.actionCount} ${g.actionCount === 1 ? 'action' : 'actions'}`}
              selected={goalId === g.id}
              onPress={() => setPicked(g.id)}
              divider={i < active.length - 1}
            />
          ))}
        </View>
        <View accessible accessibilityLabel={`Starts today, ${longDate(start)}. Ends ${longDate(end)}.`} style={{ gap: 2 }}>
          <Text variant="meta" tone="muted" tabular>
            {`Starts today, ${longDate(start)}`}
          </Text>
          <Text variant="meta" tone="muted" tabular>
            {`Ends ${longDate(end)} (day ${CHALLENGE_DAYS})`}
          </Text>
        </View>
        <CheckRow label={COMMITMENT} selected={committed} onPress={() => setCommitted((c) => !c)} divider={false} />
        {error ? (
          <Text variant="body" tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <View style={{ alignItems: 'flex-start', gap: space[1] }}>
          <Button
            title="Start the challenge"
            loading={busy}
            disabled={!goalId || !committed}
            onPress={() => goalId && committed && void join(goalId)}
          />
          {!goalId || !committed ? (
            <Text variant="caption" tone="muted">
              {!goalId ? 'Choose a goal and tick the commitment to start.' : 'Tick the commitment to start.'}
            </Text>
          ) : null}
        </View>
      </>
    );

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <View style={{ gap: space[2] }}>
        <Text variant="title">30 days, one goal</Text>
        <Text variant="body">
          Thirty days focused on a single goal: build the plan, act on it every day, and review it every week.
        </Text>
        <Text variant="meta" tone="muted">
          The challenge is this app&apos;s way of putting the Harada Method into daily practice. It is not part of the method itself.
        </Text>
      </View>

      <Section title="Who it is for">
        <Text variant="body" tone="muted">
          Anyone with a goal they care about who wants to turn the plan into a daily habit. It works best once your goal has a
          few key areas and actions planned.
        </Text>
      </Section>

      <Section title="What you do">
        <View>
          {STEPS.map((s, i) => (
            <ListRow key={s.title} title={s.title} meta={s.meta} divider={i < STEPS.length - 1} />
          ))}
        </View>
      </Section>

      <Section title="How long, and what to expect">
        <Text variant="body" tone="muted">
          {`${CHALLENGE_DAYS} days in a row, starting the day you join. You can leave at any time; your goal and everything you logged stay.`}
        </Text>
        <Text variant="body">
          A steady execution habit and measurable progress — not a promise that the whole goal is done in 30 days.
        </Text>
      </Section>

      <Section title="Join" description="One challenge at a time.">
        {joinBody}
      </Section>

      {history.length > 0 ? (
        <Section title="Past challenges">
          <View>
            {history.map((e, i) => (
              <ListRow
                key={e.id}
                title={titleOf(e.goalId)}
                meta={`${shortDate(e.startDate)} – ${shortDate(e.endDate)}`}
                trailing={<Badge text={e.status === 'completed' ? 'Finished' : 'Left early'} />}
                onPress={() => onOpenReport(e.id)}
                accessibilityLabel={`${titleOf(e.goalId)}, ${shortDate(e.startDate)} to ${shortDate(e.endDate)}, ${e.status === 'completed' ? 'finished' : 'left early'}`}
                accessibilityHint="Opens the report"
                chevron
                divider={i < history.length - 1}
              />
            ))}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}
