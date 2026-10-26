import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { errorMessage } from '@/data/errors';
import { completeChallenge, track, type ChallengeSummary } from '@/data/premium';
import { useTheme } from '@/theme';
import { Badge, Button, IconButton, ListRow, Screen, Section, Text, TextField } from '@/ui';
import { CheckRow, StatRow } from './controls';
import { CHALLENGE_DAYS, MAX_ACCOMPLISHMENT_LENGTH, MAX_ACCOMPLISHMENTS, longDate, plural, shortDate } from './format';

const REFLECTION_MAX = 2000;

export type ChallengeReportProps = {
  summary: ChallengeSummary;
  /** After a confirmed save: refetch the enrollment and summary. */
  onSaved: () => void;
  onShare: (goalId: string) => void;
  onStartAnother: () => void;
  onKeepGoing: () => void;
};

/**
 * The end-of-challenge report. "What the record shows" is stored data only; "What you achieved" is the
 * user's own words, picked from the tasks completed in the window or typed. Saving is private.
 */
export function ChallengeReport({ summary: s, onSaved, onShare, onStartAnother, onKeepGoing }: ChallengeReportProps) {
  const { space } = useTheme();
  const e = s.enrollment;
  const status = e.status;
  const canFinish = status === 'active' && s.day >= CHALLENGE_DAYS;
  const reviewsDone = s.weeklyReviews.filter((w) => w.done).length;

  const record = (
    <Section title="What the record shows" description="Counted from what you logged between the start and end dates.">
      <View style={{ gap: space[1] }}>
        <Text variant="caption" tone="muted">
          ORIGINAL OBJECTIVE
        </Text>
        <Text variant="heading">{s.goal.title}</Text>
        {s.goal.successCriteria ? (
          <Text variant="body" tone="muted">
            {s.goal.successCriteria}
          </Text>
        ) : null}
      </View>
      <View>
        <StatRow label="Dates" value={`${shortDate(e.startDate)} – ${shortDate(e.endDate)}`} />
        <StatRow label="Tasks planned" value={String(s.tasksPlanned)} />
        <StatRow label="Tasks completed" value={String(s.tasksCompleted)} />
        <StatRow label="Routine check-ins" value={String(s.routineChecks)} />
        <StatRow label="Days with activity" value={`${s.activeDays} of ${CHALLENGE_DAYS}`} />
        <StatRow label="Weekly reviews written" value={`${reviewsDone} of ${s.weeklyReviews.length}`} divider={false} />
      </View>
      <View style={{ gap: space[1] }}>
        <Text variant="headline">Milestones</Text>
        {s.milestones.length > 0 ? (
          <View>
            {s.milestones.map((m, i) => (
              <ListRow key={`${m.date}-${i}`} title={m.title} meta={`Completed ${shortDate(m.date)}`} divider={i < s.milestones.length - 1} />
            ))}
          </View>
        ) : (
          <Text variant="body" tone="muted">
            No tasks were completed in this window.
          </Text>
        )}
      </View>
    </Section>
  );

  const honesty = (
    <Text variant="body" accessibilityRole="text">
      Finishing the challenge isn&apos;t the same as reaching the goal. Only you decide when the goal is achieved.
    </Text>
  );

  const next = (
    <Section title="What next">
      <Text variant="body" tone="muted">
        Keep going with your daily actions, or start another 30 days on this goal or a different one.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
        <Button title="Keep going on Today" variant="secondary" onPress={onKeepGoing} />
        <Button title="Start another challenge" variant="secondary" onPress={onStartAnother} />
      </View>
    </Section>
  );

  const share = (
    <View style={{ alignItems: 'flex-start' }}>
      <Button title="Create a shareable card" variant="secondary" onPress={() => onShare(s.goal.id)} />
    </View>
  );

  if (status === 'completed') {
    return (
      <Screen>
        <View style={{ gap: space[1] }}>
          <Badge text={`Finished ${e.completedAt ? shortDate(e.completedAt.slice(0, 10)) : ''}`.trim()} tone="success" />
          <Text variant="title">Your 30-day report</Text>
        </View>
        {honesty}
        {record}
        <Section title="What you achieved">
          {e.accomplishments.length > 0 ? (
            <View>
              {e.accomplishments.map((a, i) => (
                <ListRow key={`${i}-${a}`} title={a} divider={i < e.accomplishments.length - 1} />
              ))}
            </View>
          ) : (
            <Text variant="body" tone="muted">
              No accomplishments noted.
            </Text>
          )}
          {e.finalReflection ? (
            <View style={{ gap: space[1] }}>
              <Text variant="headline">Final reflection</Text>
              <Text variant="body">{e.finalReflection}</Text>
            </View>
          ) : null}
          {share}
        </Section>
        {next}
      </Screen>
    );
  }

  if (!canFinish) {
    return (
      <Screen>
        <Text variant="title">Challenge report</Text>
        {status === 'left' ? (
          <Text variant="body" tone="muted">
            {`You left this challenge before day ${CHALLENGE_DAYS}. The record below covers what you logged while it ran.`}
          </Text>
        ) : (
          <Text variant="body" accessibilityRole="alert">
            {`You can finish the challenge from day ${CHALLENGE_DAYS}. Today is day ${s.day} — ${plural(CHALLENGE_DAYS - s.day, 'day')} to go.`}
          </Text>
        )}
        {record}
        {status === 'left' ? next : null}
      </Screen>
    );
  }

  return <CompleteForm summary={s} record={record} honesty={honesty} share={share} next={next} onSaved={onSaved} />;
}

function CompleteForm({
  summary: s,
  record,
  honesty,
  share,
  next,
  onSaved,
}: {
  summary: ChallengeSummary;
  record: ReactNode;
  honesty: ReactNode;
  share: ReactNode;
  next: ReactNode;
  onSaved: () => void;
}) {
  const { space } = useTheme();
  const [picked, setPicked] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [reflection, setReflection] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const full = picked.length >= MAX_ACCOMPLISHMENTS;
  const milestoneTitles = [...new Set(s.milestones.map((m) => m.title.slice(0, MAX_ACCOMPLISHMENT_LENGTH)))];
  const typed = picked.filter((p) => !milestoneTitles.includes(p));

  const toggle = (title: string) =>
    setPicked((p) => (p.includes(title) ? p.filter((x) => x !== title) : p.length >= MAX_ACCOMPLISHMENTS ? p : [...p, title]));

  const addTyped = () => {
    const v = draft.trim().slice(0, MAX_ACCOMPLISHMENT_LENGTH);
    if (!v || full || picked.includes(v)) return;
    setPicked((p) => [...p, v]);
    setDraft('');
  };

  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await completeChallenge(s.enrollment.id, reflection.trim(), picked.slice(0, MAX_ACCOMPLISHMENTS));
      if (res.ok) {
        setSaved(true);
        track('challenge_completed', { active_days: s.activeDays, accomplishments: picked.length });
        onSaved();
      } else setError(errorMessage(res.error));
    } catch {
      setError(errorMessage({ code: 'UNAVAILABLE', message: '' }));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text variant="title">Your 30-day report</Text>
      {honesty}
      {record}
      <Section
        title="What you achieved"
        description="In your own words. Pick from the tasks you completed, or write your own."
        action={
          <Text variant="meta" tone="muted" tabular accessibilityLabel={`${picked.length} of ${MAX_ACCOMPLISHMENTS} chosen`}>
            {`${picked.length} of ${MAX_ACCOMPLISHMENTS}`}
          </Text>
        }
      >
        {milestoneTitles.length > 0 ? (
          <View>
            {milestoneTitles.map((t, i) => (
              <CheckRow
                key={t}
                label={t}
                selected={picked.includes(t)}
                disabled={full && !picked.includes(t)}
                onPress={() => toggle(t)}
                divider={i < milestoneTitles.length - 1}
              />
            ))}
          </View>
        ) : null}
        {typed.length > 0 ? (
          <View>
            {typed.map((t, i) => (
              <ListRow
                key={t}
                title={t}
                divider={i < typed.length - 1}
                trailing={<IconButton icon="close" tone="muted" accessibilityLabel={`Remove: ${t}`} onPress={() => toggle(t)} />}
              />
            ))}
          </View>
        ) : null}
        <TextField
          label="Add an accomplishment"
          value={draft}
          onChangeText={setDraft}
          maxLength={MAX_ACCOMPLISHMENT_LENGTH}
          editable={!full}
          hint={full ? `You have ${MAX_ACCOMPLISHMENTS} of ${MAX_ACCOMPLISHMENTS}. Remove one to add another.` : undefined}
          onSubmitEditing={addTyped}
          returnKeyType="done"
        />
        <View style={{ alignItems: 'flex-start' }}>
          <Button title="Add" variant="secondary" size="compact" disabled={!draft.trim() || full} onPress={addTyped} />
        </View>
      </Section>
      <Section title="Final reflection">
        <TextField
          label="Looking back on the 30 days"
          hint="What worked, what got in the way, and what you will keep doing."
          value={reflection}
          onChangeText={setReflection}
          maxLength={REFLECTION_MAX}
          multiline
        />
        {error ? (
          <Text variant="body" tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <View style={{ gap: space[2], alignItems: 'flex-start' }}>
          <Button title={saved ? 'Saved' : 'Save privately'} loading={busy} disabled={saved} onPress={() => void save()} />
          <Text variant="caption" tone="muted">
            Only you can see the report. Nothing is shared unless you create a card.
          </Text>
        </View>
        {share}
      </Section>
      {next}
    </Screen>
  );
}
