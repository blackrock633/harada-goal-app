import type { TodayDTO } from '../dto';
import { AppFail, guard } from '../errors';
import type { Deps } from '../ports';
import type { Ctx, Result } from '../result';
import { buildTodayDTO, loadGraph } from './assemble';

export async function getToday(deps: Deps, ctx: Ctx, _input?: unknown): Promise<Result<TodayDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const profile = await repos.profiles.findById(ctx.userId);
      if (!profile) throw new AppFail('UNAUTHENTICATED', 'Please sign in');
      const goals = await repos.goals.listByOwner(ctx.userId);
      const liveIds = goals.filter((g) => g.status === 'active' || g.status === 'draft').map((g) => g.id);
      const [graph, lastReflected] = await Promise.all([
        loadGraph(repos, ctx.userId, liveIds, ctx.today),
        liveIds.length ? repos.reflections.latestDateByGoals(liveIds) : Promise.resolve({}),
      ]);
      return buildTodayDTO(goals, graph, lastReflected, ctx.today, profile.timeZone);
    }),
  );
}
