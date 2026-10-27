'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import type { GoalVisibility } from '@/application/social';
import { setGoalVisibilityAction } from '@/app/actions/social';
import { routes } from '@/ui/routes';

export interface GoalVisibilityBarProps {
  goalId: string;
  goalStatus: string;
  initialVisibility: GoalVisibility;
}

export function GoalVisibilityBar({
  goalId,
  goalStatus,
  initialVisibility,
}: GoalVisibilityBarProps) {
  const [visibility, setVisibility] = useState<GoalVisibility>(initialVisibility);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const prev = visibility;
    const next: GoalVisibility = visibility === 'public' ? 'private' : 'public';
    setVisibility(next);
    setError(null);
    startTransition(async () => {
      const res = await setGoalVisibilityAction({ goalId, visibility: next });
      if (!res.ok) {
        setVisibility(prev);
        setError(res.error.message);
      }
    });
  };

  return (
    <div
      data-testid="goal-visibility-bar"
      className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-rule bg-surface px-3.5 py-2.5 text-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] tracking-[0.16em] text-ink-muted uppercase">
          Community Visibility:
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={toggle}
          className={`rounded-[var(--radius-sm)] border px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors ${
            visibility === 'public'
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-rule bg-paper text-ink-muted hover:text-ink'
          }`}
        >
          {visibility === 'public' ? 'Public on Profile' : 'Private (Only You)'}
        </button>
        {error && <span className="text-danger">{error}</span>}
      </div>
      <Link
        href={routes.communityShare({
          goalId,
          type: goalStatus === 'achieved' ? 'goal_completed' : 'progress_update',
        })}
        className="font-mono text-[11px] font-medium text-accent underline underline-offset-2 hover:text-ink"
      >
        {goalStatus === 'achieved' ? 'Celebrate completion →' : 'Share progress update →'}
      </Link>
    </div>
  );
}
