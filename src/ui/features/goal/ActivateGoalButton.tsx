'use client';

import * as React from 'react';
import Link from 'next/link';
import type { GoalFieldsDTO } from '@/application/dto';
import type { GoalMutations } from '@/ui/actions';
import { Button } from '@/ui/primitives';
import { errorMessage } from '@/ui/errors';
import { trackWrite } from '@/ui/pending-writes';
import { routes } from '@/ui/routes';

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
  const [needsUpgrade, setNeedsUpgrade] = React.useState(false);
  async function run() {
    if (pending) return;
    setPending(true);
    setError('');
    setNeedsUpgrade(false);
    try {
      const res = await trackWrite(activateGoal({ goalId }));
      if (res.ok) onActivated?.(res.data);
      else {
        setError(errorMessage(res.error));
        setNeedsUpgrade(res.error.code === 'UPGRADE_REQUIRED');
      }
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
      {error && !needsUpgrade && <p role="alert" className="text-sm text-danger">{error}</p>}
      {error && needsUpgrade && (
        <div role="alert" className="rounded-[var(--radius-sm)] border border-rule px-3 py-2 text-sm text-ink">
          <p>{error}</p>
          <p className="mt-1 text-ink-muted">Your draft is saved either way.</p>
          <Link
            href={routes.pricing}
            className="mt-1 inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-2"
          >
            See Harada Pro
          </Link>
        </div>
      )}
    </div>
  );
}
