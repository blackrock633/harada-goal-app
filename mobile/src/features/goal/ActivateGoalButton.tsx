import { useRef, useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '@/data/errors';
import type { GoalMutations } from '@/data/mutations';
import { useTheme } from '@/theme';
import { Button, Text } from '@/ui';
import type { GoalFieldsDTO } from '@shared/application/dto';

import { UpgradePrompt } from '../premium/UpgradePrompt';

export type ActivateGoalButtonProps = {
  goalId: string;
  activateGoal: GoalMutations['activateGoal'];
  onActivated?: (goal: GoalFieldsDTO) => void;
  /** Line above the button; pass null where the surrounding screen already says it. */
  note?: string | null;
};

export function ActivateGoalButton({
  goalId,
  activateGoal,
  onActivated,
  note = 'This goal is a draft. Activating it puts its actions on Today.',
}: ActivateGoalButtonProps) {
  const { space } = useTheme();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  // Free allows one active goal: the server refuses a second with UPGRADE_REQUIRED. The goal stays a draft.
  const [needsPro, setNeedsPro] = useState(false);
  const inFlight = useRef(false);

  async function run() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    setNeedsPro(false);
    try {
      const res = await activateGoal({ goalId });
      if (res.ok) onActivated?.(res.data);
      else if (res.error.code === 'UPGRADE_REQUIRED') setNeedsPro(true);
      else setError(errorMessage(res.error));
    } catch {
      setError('Could not activate. Please try again.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <View style={{ gap: space[2] }}>
      {note ? (
        <Text variant="meta" tone="muted">
          {note}
        </Text>
      ) : null}
      <View style={{ alignItems: 'flex-start' }}>
        <Button title="Activate goal" loading={pending} onPress={run} />
      </View>
      {error ? (
        <Text variant="meta" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {needsPro ? (
        <UpgradePrompt
          feature="multiple_goals"
          trigger="action"
          note="You already have an active goal. This one is kept as a draft, with everything you planned."
          onDismiss={() => setNeedsPro(false)}
        />
      ) : null}
    </View>
  );
}
