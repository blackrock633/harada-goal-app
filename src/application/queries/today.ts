import { nextActions, type NextItem } from '@/domain/next';
import type { NextItemDTO, TodayDTO } from '../dto';
import { AppFail, guard } from '../errors';
import type { Deps } from '../ports';
import type { Ctx, Result } from '../result';
import { actionDTO, buildSummaries, loadGraph } from './assemble';

export async function getToday(deps: Deps, ctx: Ctx, _input?: unknown): Promise<Result<TodayDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const profile = await repos.profiles.findById(ctx.userId);
      if (!profile) throw new AppFail('UNAUTHENTICATED', 'Please sign in');
      const goals = await repos.goals.listByOwner(ctx.userId);
      const live = goals.filter((g) => g.status === 'active' || g.status === 'draft');
      const graph = await loadGraph(repos, live.map((g) => g.id), ctx.today);
      const { next, doneToday } = nextActions(
        { goals: live, outcomes: graph.outcomes, actions: graph.actions, checksByActionId: graph.checks },
        ctx.today,
        profile.timeZone,
      );
      const toDto = (i: NextItem): NextItemDTO => ({
        action: actionDTO(i.action, graph.checks.get(i.action.id) ?? [], ctx.today),
        goalId: i.goal.id,
        goalTitle: i.goal.title,
        outcomeId: i.outcome.id,
        outcomeTitle: i.outcome.title,
        outcomePosition: i.outcome.position ?? 0,
        overdue: i.overdue,
      });
      const summaries = await buildSummaries(repos, live, ctx.today, profile.timeZone, graph);
      return {
        today: ctx.today,
        next: next.map(toDto),
        doneToday: doneToday.map(toDto),
        goals: summaries.filter((s) => s.status === 'active'),
        draftGoals: summaries.filter((s) => s.status === 'draft'),
        hasAnyGoals: goals.some((g) => g.status !== 'archived'),
      };
    }),
  );
}
