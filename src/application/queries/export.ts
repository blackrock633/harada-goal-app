import { AppFail, guard } from '../errors';
import type { Deps } from '../ports';
import type { Ctx, Result } from '../result';
import { actionFieldsDTO, eventDTO, goalFieldsDTO, outcomeFieldsDTO, reflectionDTO } from './assemble';

export interface ExportDTO {
  exportedAt: string;
  profile: { displayName: string; timeZone: string };
  goals: Array<
    ReturnType<typeof goalFieldsDTO> & {
      outcomes: ReturnType<typeof outcomeFieldsDTO>[];
      actions: ReturnType<typeof actionFieldsDTO>[];
      routineChecks: { actionId: string; date: string }[];
      reflections: ReturnType<typeof reflectionDTO>[];
      events: ReturnType<typeof eventDTO>[];
    }
  >;
}

/** Everything the user owns, as JSON-safe data. Structure/checks are batched; reflections and events are per goal. */
export async function exportData(deps: Deps, ctx: Ctx, _input?: unknown): Promise<Result<ExportDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const profile = await repos.profiles.findById(ctx.userId);
      if (!profile) throw new AppFail('UNAUTHENTICATED', 'Please sign in');
      const goals = await repos.goals.listByOwner(ctx.userId);
      const ids = goals.map((g) => g.id);
      const [outcomes, actions] = ids.length
        ? await Promise.all([repos.outcomes.listByGoals(ids), repos.actions.listByGoals(ids)])
        : [[], []];
      const checks = actions.length
        ? await repos.checks.listForActions(actions.map((a) => a.id), '0001-01-01', '9999-12-31')
        : [];
      const perGoal = await Promise.all(
        goals.map(async (g) => ({
          reflections: await repos.reflections.listByGoal(g.id, { limit: 1_000_000 }),
          events: await repos.events.listByGoal(g.id, { limit: 1_000_000 }),
        })),
      );
      return {
        exportedAt: ctx.now.toISOString(),
        profile: { displayName: profile.displayName, timeZone: profile.timeZone },
        goals: goals.map((g, i) => {
          const goalActions = actions.filter((a) => a.goalId === g.id);
          const actionIds = new Set(goalActions.map((a) => a.id));
          return {
            ...goalFieldsDTO(g),
            outcomes: outcomes.filter((o) => o.goalId === g.id).map(outcomeFieldsDTO),
            actions: goalActions.map(actionFieldsDTO),
            routineChecks: checks.filter((c) => actionIds.has(c.actionId)).map((c) => ({ actionId: c.actionId, date: c.date })),
            reflections: perGoal[i]!.reflections.map(reflectionDTO),
            events: perGoal[i]!.events.map(eventDTO),
          };
        }),
      };
    }),
  );
}
