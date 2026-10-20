import type { Goal, GoalEventType, Id } from '@/domain/types';
import { assertGoalEditable } from '@/domain/goal';
import { AppFail, STALE_MESSAGE, notFound } from '../errors';
import type { Deps, Repos } from '../ports';
import type { Ctx } from '../result';

/** Locks the parent goal (serialises structural edits); NOT_FOUND if missing or not owned. */
export async function lockGoal(repos: Repos, ctx: Ctx, goalId: Id, opts: { editable?: boolean } = {}): Promise<Goal> {
  const goal = await repos.goals.lock(ctx.userId, goalId);
  if (!goal) throw notFound();
  if (opts.editable !== false) assertGoalEditable(goal);
  return goal;
}

export async function appendEvent(
  repos: Repos,
  deps: Deps,
  ctx: Ctx,
  goalId: Id,
  type: GoalEventType,
  subjectId: Id | null,
  summary: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  await repos.events.append({ id: deps.ids(), goalId, type, subjectId, summary, data, occurredAt: ctx.now });
}

/** Optimistic concurrency (M-08). */
export function assertFresh(current: Date, expectedUpdatedAt: string | undefined): void {
  if (expectedUpdatedAt !== undefined && new Date(expectedUpdatedAt).getTime() !== current.getTime()) {
    throw new AppFail('CONFLICT', STALE_MESSAGE);
  }
}

export function assertSlotAvailable(taken: (number | null)[], position: number | undefined): void {
  if (position !== undefined && taken.includes(position)) throw new AppFail('CONFLICT', 'That slot is already filled');
}

/** Spreads a changed-keys list into an event summary. */
export const changedList = (keys: readonly string[]) => keys.join(', ');
