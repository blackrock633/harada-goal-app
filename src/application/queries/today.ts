import { nextActions, type NextItem } from '@/domain';
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
      const graph = await loadGraph(repos, ctx.userId, live.map((g) => g.id), ctx.today);
      const { next, doneToday } = nextActions(
        { goals: live, outcomes: graph.outcomes, actions: graph.actions, checksByActionId: graph.checks },
        ctx.today,
        profile.timeZone,
      );
      const goalById = new Map(live.map((g) => [g.id, g]));
      const outcomeById = new Map(graph.outcomes.map((o) => [o.id, o]));
      const actionById = new Map(graph.actions.map((a) => [a.id, a]));
      const focusItems: NextItem[] = [];
      for (const f of graph.focusRows) {
        const action = actionById.get(f.actionId);
        const outcome = action && outcomeById.get(action.outcomeId);
        const goal = action && goalById.get(action.goalId);
        if (!action || !outcome || !goal) continue;
        if (action.archivedAt !== null || outcome.archivedAt !== null) continue;
        focusItems.push({
          action,
          outcome,
          goal,
          overdue: action.kind === 'task' && action.completedAt === null && action.dueDate !== null && action.dueDate < ctx.today,
        });
      }
      const focusIds = new Set(focusItems.map((i) => i.action.id));
      const toDto = (i: NextItem): NextItemDTO => ({
        action: actionDTO(i.action, graph.checks.get(i.action.id) ?? [], ctx.today, graph.focused.has(i.action.id)),
        goalId: i.goal.id,
        goalTitle: i.goal.title,
        outcomeId: i.outcome.id,
        outcomeTitle: i.outcome.title,
        outcomePosition: i.outcome.position ?? 0,
        overdue: i.overdue,
      });
      const summaries = await buildSummaries(repos, ctx.userId, live, ctx.today, profile.timeZone, graph);
      return {
        today: ctx.today,
        focus: focusItems.map(toDto),
        next: next.filter((i) => !focusIds.has(i.action.id)).map(toDto),
        doneToday: doneToday.filter((i) => !focusIds.has(i.action.id)).map(toDto),
        goals: summaries.filter((s) => s.status === 'active'),
        draftGoals: summaries.filter((s) => s.status === 'draft'),
        hasAnyGoals: goals.some((g) => g.status !== 'archived'),
      };
    }),
  );
}
