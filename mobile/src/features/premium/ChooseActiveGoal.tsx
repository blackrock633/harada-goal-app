import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useGoals } from '@/data/hooks';
import { errorMessage } from '@/data/errors';
import { chooseActiveGoal, useRefreshPlan, type PlanInfo } from '@/data/premium';
import { keys } from '@/data/query-client';
import { useTheme } from '@/theme';
import { Button, CheckCircle, ListRow, Sheet, Text } from '@/ui';

import { upgradeHref } from './routes';

export type ChooseActiveGoalProps = {
  visible: boolean;
  onClose: () => void;
  /** After the server confirmed the choice. */
  onChosen?: (goalId: string) => void;
};

/**
 * After a downgrade the user has more active goals than Free allows. They pick the one to keep;
 * the others are archived (hidden, never deleted) and can be restored later. Nothing changes until
 * they confirm, and nothing is archived on the device's say-so: choose_active_goal does it.
 */
export function ChooseActiveGoal({ visible, onClose, onChosen }: ChooseActiveGoalProps) {
  const { space } = useTheme();
  const goals = useGoals();
  const qc = useQueryClient();
  const refreshPlan = useRefreshPlan();
  const [picked, setPicked] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const active = (goals.data ?? []).filter((g) => g.status === 'active');

  async function confirm() {
    if (inFlight.current || !picked) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await chooseActiveGoal(picked);
      if (!res.ok) {
        setError(errorMessage(res.error));
        return;
      }
      await Promise.all([
        refreshPlan(),
        qc.invalidateQueries({ queryKey: keys.goals }),
        qc.invalidateQueries({ queryKey: keys.todayRoot }),
      ]);
      onChosen?.(picked);
      onClose();
    } catch {
      setError(errorMessage({ code: 'UNAVAILABLE', message: '' }));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        if (!inFlight.current) onClose();
      }}
      title="Choose a goal to keep active"
      footer={
        <View style={{ gap: space[3] }}>
          {error ? (
            <Text variant="meta" tone="danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button title="Keep this goal active" loading={pending} disabled={!picked} onPress={() => void confirm()} />
        </View>
      }
    >
      <Text tone="muted">
        Free includes one active goal. The goals you don’t pick are archived, not deleted: their plans, history and
        reflections are kept, and you can restore one later or keep them all active with Harada Pro.
      </Text>
      {goals.isPending ? (
        <Text tone="muted" accessibilityRole="progressbar">
          Loading your goals…
        </Text>
      ) : goals.isError ? (
        <View style={{ gap: space[2], alignItems: 'flex-start' }}>
          <Text tone="danger" accessibilityRole="alert">
            Couldn’t load your goals.
          </Text>
          <Button title="Try again" variant="secondary" size="compact" onPress={() => void goals.refetch()} />
        </View>
      ) : (
        <View accessibilityRole="radiogroup" accessibilityLabel="Active goals">
          {active.map((g, i) => (
            <ListRow
              key={g.id}
              title={g.title}
              meta={`${g.metrics.planning.filled} of ${g.metrics.planning.total} positions planned`}
              divider={i < active.length - 1}
              onPress={() => setPicked(g.id)}
              accessibilityLabel={`Keep ${g.title} active${picked === g.id ? ', selected' : ''}`}
              leading={<CheckCircle checked={picked === g.id} accessibilityLabel={`Keep ${g.title}`} onPress={() => setPicked(g.id)} />}
            />
          ))}
        </View>
      )}
    </Sheet>
  );
}

/**
 * Banner for the goal tab and Settings while the plan is over its active-goal limit. Opens the
 * chooser; the user can also leave things as they are (nothing is archived until they choose).
 */
export function OverLimitNotice({ plan }: { plan: PlanInfo | null | undefined }) {
  const { colors, radius, space } = useTheme();
  const [open, setOpen] = useState(false);
  if (!plan?.overLimit) return null;
  const limit = plan.maxActiveGoals ?? 1;
  return (
    <View
      testID="over-limit-notice"
      accessibilityRole="alert"
      style={{ borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm, padding: space[3], gap: space[2] }}
    >
      <Text variant="meta">
        {`You have ${plan.activeGoals} active goals, and your plan includes ${limit}. Choose the one to keep active. The others are archived, not deleted, and you can restore them.`}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        <Button title="Choose a goal" variant="secondary" size="compact" onPress={() => setOpen(true)} />
        <Button title="See Harada Pro" variant="ghost" size="compact" onPress={() => router.push(upgradeHref('multiple_goals'))} />
      </View>
      <ChooseActiveGoal visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}
