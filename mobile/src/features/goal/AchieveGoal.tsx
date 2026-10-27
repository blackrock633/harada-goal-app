import { router, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '@/data/errors';
import type { GoalMutations } from '@/data/mutations';
import { useTheme } from '@/theme';
import { Button, Sheet, Text } from '@/ui';

/**
 * "Mark goal achieved": only the user decides this, so it is asked, not inferred. Afterwards sharing is
 * offered once, as an option; nothing is posted unless the user goes on to post it.
 */
export function AchieveGoal({ goalId, title, markGoalAchieved, onDone }: { goalId: string; title: string; markGoalAchieved: GoalMutations['markGoalAchieved']; onDone?: () => void }) {
  const { space } = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const res = await markGoalAchieved({ goalId });
    inFlight.current = false;
    setBusy(false);
    if (!res.ok) return setError(errorMessage(res.error));
    setDone(true);
  }

  const close = () => {
    setOpen(false);
    if (done) onDone?.();
  };

  return (
    <>
      <Button title="Mark goal achieved" icon="check" variant="ghost" onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={close} title={done ? 'Goal achieved' : 'Mark goal achieved?'}>
        {done ? (
          <View style={{ gap: space[3] }}>
            <Text>{`“${title}” is marked achieved.`}</Text>
            <Button
              title="Share this achievement"
              icon="share"
              onPress={() => {
                setOpen(false);
                onDone?.();
                router.push(`/share?goalId=${goalId}&type=goal_completed` as Href);
              }}
            />
            <Button title="Not now" variant="ghost" onPress={close} />
          </View>
        ) : (
          <View style={{ gap: space[3] }}>
            <Text>{`Mark “${title}” as achieved? You can reopen it later.`}</Text>
            <Button title="Mark achieved" loading={busy} onPress={() => void confirm()} />
            {error ? (
              <Text tone="danger" accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
          </View>
        )}
      </Sheet>
    </>
  );
}
