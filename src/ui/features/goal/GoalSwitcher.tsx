'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { GoalSummaryDTO } from '@/application/dto';
import { routes } from '@/ui/routes';
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from '@/ui/primitives';

export interface GoalSwitcherProps {
  goals: GoalSummaryDTO[];
  currentGoalId?: string;
  /** Build the link for a goal; defaults to the My Goal route with ?goal=. */
  hrefFor?: (goalId: string) => string;
}

export function GoalSwitcher({ goals, currentGoalId, hrefFor = (id) => routes.goal(id) }: GoalSwitcherProps) {
  const current = goals.find((g) => g.id === currentGoalId);
  return (
    <MenuRoot>
      <MenuTrigger className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-[var(--radius-sm)] border border-rule-strong bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <span className="truncate">{current ? current.title : 'Switch goal'}</span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      </MenuTrigger>
      <MenuContent align="start" className="max-w-[min(20rem,90vw)]">
        {goals.map((g) => (
          <MenuItem key={g.id} asChild>
            <Link href={hrefFor(g.id)} aria-current={g.id === currentGoalId ? 'true' : undefined} className="min-h-[44px]">
              <span className="truncate">{g.title}</span>
              {g.status === 'draft' && <span className="ml-2 text-ink-muted">(draft)</span>}
            </Link>
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem asChild>
          <Link href={routes.goalNew} className="min-h-[44px]">New goal</Link>
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  );
}
