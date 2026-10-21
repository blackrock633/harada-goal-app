import { useRef, useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '@/data/errors';
import type { GoalMutations } from '@/data/mutations';
import { useTheme } from '@/theme';
import { Button, Text } from '@/ui';
import type { GoalFieldsDTO } from '@shared/application/dto';

export type ActivateGoalButtonProps = {
  goalId: string;
  activateGoal: GoalMutations['activateGoal'];
  onActivated?: (goal: GoalFieldsDTO) => void;
};

export function ActivateGoalButton({ goalId, activateGoal, onActivated }: ActivateGoalButtonProps) {
  const { space } = useTheme();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  async function run() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      const res = await activateGoal({ goalId });
      if (res.ok) onActivated?.(res.data);
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
      <Text variant="meta" tone="muted">
        This goal is a draft. Activating it puts its actions on Today.
      </Text>
      <Button title="Activate goal" loading={pending} onPress={run} />
      {error ? (
        <Text variant="meta" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
