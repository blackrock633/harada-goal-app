import { useRef, useState } from 'react';
import { View } from 'react-native';

import type { TodayDTO } from '@shared/application/dto';
import { errorMessage, newClientId } from '@/data/errors';
import type { ExecutionMutations, ReviewMutations } from '@/data/mutations';
import { leaveChallenge, track, type ChallengeSummary } from '@/data/premium';
import { useTheme } from '@/theme';
import { Badge, Button, ListRow, Screen, Section, Sheet, Text, TextField } from '@/ui';
import { CalendarStrip } from './CalendarStrip';
import { ChallengeToday } from './ChallengeToday';
import { StatRow } from './controls';
import {
  CHALLENGE_DAYS,
  calendarCells,
  inDaysText,
  longDate,
  missedDays,
  missedDaysCopy,
  nextCheckpoint,
  plural,
  shortDate,
  weekStartDay,
} from './format';

/** A short note: the same reflection field the Review tab calls "What didn't go well". */
const OBSTACLE_MAX = 500;

export type ChallengeDashboardProps = {
  summary: ChallengeSummary;
  /** Today's lists (undefined while loading; the section then says so). */
  todayData?: TodayDTO;
  mutations: ExecutionMutations & Pick<ReviewMutations, 'addReflection'>;
  /** Refetch the summary (and whatever else) after a change here. */
  onChanged: () => void;
  onLeft: () => void;
  onOpenToday: () => void;
  onOpenReview: (goalId: string) => void;
  onComplete: (enrollmentId: string) => void;
  onShare: (goalId: string) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
};

/** The running challenge: where you are, what to do today, and what has been logged. All numbers are stored data. */
export function ChallengeDashboard({
  summary: s,
  todayData,
  mutations,
  onChanged,
  onLeft,
  onOpenToday,
  onOpenReview,
  onComplete,
  onShare,
  refreshing,
  onRefresh,
}: ChallengeDashboardProps) {
  const { space } = useTheme();
  const cells = calendarCells(s);
  const missed = missedDaysCopy(missedDays(cells));
  const checkpoint = nextCheckpoint(s.day);
  const todayCount = s.days.find((d) => d.date === s.today);
  const hadActivityToday = useRef(!!todayCount && todayCount.tasksCompleted + todayCount.routineChecks > 0);
  const finished = s.day >= CHALLENGE_DAYS;
  const currentWeek = Math.max(1, Math.ceil(Math.max(s.day, 1) / 7));
  const reviewsDone = s.weeklyReviews.filter((w) => w.done).length;
  const recent = [...s.milestones].reverse().slice(0, 5);

  const changed = (completed: boolean) => {
    // The first completion of the day: "a challenge day done" (count only, no content).
    if (completed && !hadActivityToday.current) {
      hadActivityToday.current = true;
      track('challenge_day_completed', { day: s.day });
    }
    onChanged();
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <View style={{ gap: space[1] }}>
        <Text variant="caption" tone="muted">
          30-DAY CHALLENGE
        </Text>
        <Text variant="title">{s.goal.title}</Text>
        <Text variant="headline" tabular accessibilityRole="header">
          {s.day === 0 ? `Starts ${longDate(s.enrollment.startDate)}` : `Day ${s.day} of ${CHALLENGE_DAYS}`}
        </Text>
        <Text variant="meta" tone="muted" tabular>
          {s.daysRemaining > 0
            ? `${plural(s.daysRemaining, 'day')} remaining · ends ${longDate(s.enrollment.endDate)}`
            : `Ended ${longDate(s.enrollment.endDate)}`}
        </Text>
      </View>

      {finished ? (
        <Section title="Day 30: write your report" ruled={false}>
          <Text variant="body" tone="muted">
            You have reached the last day. Finish with a short report: what the numbers show, and what you would say you achieved.
          </Text>
          <View style={{ alignItems: 'flex-start' }}>
            <Button title="Finish the challenge" onPress={() => onComplete(s.enrollment.id)} />
          </View>
        </Section>
      ) : null}

      <Section title="The 30 days" ruled={!finished}>
        <CalendarStrip cells={cells} day={s.day} />
        {missed ? (
          <Text variant="meta" tone="muted">
            {missed}
          </Text>
        ) : null}
      </Section>

      <Section title="Today">
        {todayData ? (
          <ChallengeToday data={todayData} goalId={s.goal.id} mutations={mutations} onChanged={changed} onOpenToday={onOpenToday} />
        ) : (
          <Text variant="body" tone="muted">
            Loading today&apos;s actions…
          </Text>
        )}
      </Section>

      <Section title="Note an obstacle" description="One line on what got in the way today. It is saved as today's reflection.">
        <ObstacleNote goalId={s.goal.id} date={s.today} addReflection={mutations.addReflection} onSaved={onChanged} />
      </Section>

      <Section title="So far">
        <View>
          <StatRow label="Tasks completed" value={`${s.tasksCompleted} of ${s.tasksPlanned} planned`} />
          <StatRow label="Routine check-ins" value={String(s.routineChecks)} />
          <StatRow label="Days with activity" value={`${s.activeDays} of ${Math.max(s.day, 0)}`} />
          <StatRow label="Weekly reviews written" value={`${reviewsDone} of ${s.weeklyReviews.length}`} divider={false} />
        </View>
        <Text variant="caption" tone="muted">
          Counted from what you logged. Completed actions are not the same as reaching the goal.
        </Text>
      </Section>

      <Section title="Weekly reviews">
        <View>
          {s.weeklyReviews.map((w, i) => {
            const start = weekStartDay(w.week);
            const status = w.done ? 'Written' : start > s.day ? 'Later' : w.week === currentWeek ? 'This week' : 'Not written';
            return (
              <ListRow
                key={w.week}
                title={`Week ${w.week}`}
                meta={`Days ${start}–${Math.min(start + 6, CHALLENGE_DAYS)}`}
                trailing={<Badge text={status} tone={w.done ? 'success' : 'neutral'} />}
                divider={i < s.weeklyReviews.length - 1}
              />
            );
          })}
        </View>
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            title="Write this week's review"
            variant="ghost"
            icon="reflect"
            onPress={() => onOpenReview(s.goal.id)}
            style={{ marginLeft: -space[2] }}
          />
        </View>
      </Section>

      <Section title="Next checkpoint">
        <Text variant="body" tabular>
          {`Day ${checkpoint.day} · ${checkpoint.label} · ${inDaysText(checkpoint.inDays)}`}
        </Text>
      </Section>

      <Section title="Recent progress">
        {recent.length > 0 ? (
          <View>
            {recent.map((m, i) => (
              <ListRow key={`${m.date}-${m.title}-${i}`} title={m.title} meta={`Completed ${shortDate(m.date)}`} divider={i < recent.length - 1} />
            ))}
          </View>
        ) : (
          <Text variant="body" tone="muted">
            No tasks completed during the challenge yet.
          </Text>
        )}
        <View style={{ alignItems: 'flex-start' }}>
          <Button title="Create a shareable card" variant="secondary" onPress={() => onShare(s.goal.id)} />
        </View>
      </Section>

      <LeaveChallenge enrollmentId={s.enrollment.id} onLeft={onLeft} />
    </Screen>
  );
}

function ObstacleNote({
  goalId,
  date,
  addReflection,
  onSaved,
}: {
  goalId: string;
  date: string;
  addReflection: ReviewMutations['addReflection'];
  onSaved: () => void;
}) {
  const { space } = useTheme();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // One id per note, so a retry after a lost reply does not save it twice.
  const clientId = useRef<string | null>(null);
  const inFlight = useRef(false);

  async function save() {
    const value = text.trim();
    if (!value || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    clientId.current ??= newClientId();
    try {
      const res = await addReflection({ id: clientId.current, goalId, date, kind: 'daily', didntGoWell: value });
      if (res.ok) {
        clientId.current = null;
        setText('');
        setSaved(true);
        onSaved();
      } else setError(res.error.fieldErrors?.didntGoWell?.[0] ?? errorMessage(res.error));
    } catch {
      setError(errorMessage({ code: 'UNAVAILABLE', message: '' }));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: space[2] }}>
      <TextField
        label="What got in the way?"
        value={text}
        onChangeText={(t) => {
          setText(t);
          setSaved(false);
          clientId.current = null;
        }}
        maxLength={OBSTACLE_MAX}
        error={error}
        multiline
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <Button title="Save note" variant="secondary" loading={busy} disabled={!text.trim()} onPress={() => void save()} />
        {saved ? (
          <Text variant="meta" tone="success" accessibilityLiveRegion="polite">
            Saved to today&apos;s reflection.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function LeaveChallenge({ enrollmentId, onLeft }: { enrollmentId: string; onLeft: () => void }) {
  const { space } = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await leaveChallenge(enrollmentId);
      if (res.ok) {
        setOpen(false);
        onLeft();
      } else setError(errorMessage(res.error));
    } catch {
      setError(errorMessage({ code: 'UNAVAILABLE', message: '' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Leave the challenge">
      <Text variant="meta" tone="muted">
        Your goal and everything you logged stay. Only the challenge ends.
      </Text>
      <View style={{ alignItems: 'flex-start' }}>
        <Button title="Leave challenge" variant="danger" onPress={() => setOpen(true)} />
      </View>
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Leave the challenge?"
        footer={
          <View style={{ flexDirection: 'row', gap: space[3], flexWrap: 'wrap' }}>
            <Button title="Keep going" variant="secondary" onPress={() => setOpen(false)} />
            <Button title="Leave" accessibilityLabel="Confirm leave challenge" variant="danger" loading={busy} onPress={() => void leave()} />
          </View>
        }
      >
        <Text variant="body">
          The challenge ends today and moves to your past challenges. Your goal, actions and reflections are not changed. You can
          start a new challenge later.
        </Text>
        {error ? (
          <Text variant="body" tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Sheet>
    </Section>
  );
}
