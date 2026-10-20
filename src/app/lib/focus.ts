import { redirect } from 'next/navigation';
import type { GoalDetailDTO, GoalSummaryDTO } from '@/application/dto';
import type { Ctx } from '@/application/result';
import * as q from '@/application/queries';
import { getDeps } from '@/infrastructure/container';
import { routes } from '@/ui/routes';

export class QueryFailed extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** Unwrap a query Result for a server component; failures surface via the route's error.tsx. */
export function unwrap<T>(r: { ok: true; data: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!r.ok) throw new QueryFailed(r.error.code, r.error.message);
  return r.data;
}

/**
 * The goal a goal-scoped screen (My Goal, Matrix, Review) acts on: `?goal=<id>` if given,
 * otherwise the most recently activated active goal, otherwise the newest draft.
 * Users with no goals are sent to onboarding.
 */
export async function resolveFocusedGoal(
  ctx: Ctx,
  requested: string | string[] | undefined,
): Promise<{ goal: GoalDetailDTO; goals: GoalSummaryDTO[] }> {
  const deps = await getDeps();
  const goals = unwrap(await q.listGoals(deps, ctx, { status: 'all' })).filter((g) => g.status !== 'archived');
  const wanted = typeof requested === 'string' ? goals.find((g) => g.id === requested) : undefined;
  const pick = wanted ?? pickDefaultGoal(goals);
  if (!pick) redirect(routes.goalNew);
  const goal = unwrap(await q.getGoalDetail(deps, ctx, { goalId: pick.id }));
  return { goal, goals };
}

export function pickDefaultGoal(goals: GoalSummaryDTO[]): GoalSummaryDTO | undefined {
  const by = (s: GoalSummaryDTO['status']) =>
    goals
      .filter((g) => g.status === s)
      .sort((a, b) => (b.activatedOn ?? '').localeCompare(a.activatedOn ?? '') || b.updatedAt.localeCompare(a.updatedAt));
  return by('active')[0] ?? by('draft')[0] ?? by('achieved')[0];
}
