'use client';

import * as React from 'react';
import type { GoalFieldsDTO } from '@/application/dto';
import type { GoalMutations } from '@/ui/actions';
import { Button } from '@/ui/primitives';
import { errorMessage } from '@/ui/errors';

export function ActivateGoalButton({
  goalId,
  activateGoal,
  onActivated,
}: {
  goalId: string;
  activateGoal: GoalMutations['activateGoal'];
  onActivated?: (goal: GoalFieldsDTO) => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState('');
  async function run() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const res = await activateGoal({ goalId });
      if (res.ok) onActivated?.(res.data);
      else setError(errorMessage(res.error));
    } catch {
      setError('Could not activate. Please try again.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-muted">
        This goal is a draft. Activating it puts its actions on Today.
      </p>
      <Button type="button" loading={pending} onClick={run}>Activate goal</Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
