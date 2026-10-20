import { monthDays, weekdayOf } from '@/domain/dates';
import type { Action, GoalStatus } from '@/domain/types';
import { TEMPLATES } from '@/domain/templates';
import type {
  GoalDetailDTO,
  GoalEventDTO,
  GoalSummaryDTO,
  ReflectionDTO,
  RoutineSheetDTO,
  TemplateSummaryDTO,
} from '../dto';
import { AppFail, guard, notFound } from '../errors';
import type { Deps } from '../ports';
import type { Ctx, Result } from '../result';
import { goalHistorySchema, goalIdSchema, listGoalsSchema, listReflectionsSchema, routineSheetSchema } from '../schemas';
import { actionFieldsDTO, buildSummaries, eventDTO, loadGoalDetail, reflectionDTO } from './assemble';

export async function listGoals(deps: Deps, ctx: Ctx, input: unknown = {}): Promise<Result<GoalSummaryDTO[]>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { status } = listGoalsSchema.parse(input ?? {});
      const statuses: GoalStatus[] | undefined = status === 'all' ? undefined : [status];
      const profile = await repos.profiles.findById(ctx.userId);
      if (!profile) throw new AppFail('UNAUTHENTICATED', 'Please sign in');
      const goals = await repos.goals.listByOwner(ctx.userId, statuses);
      goals.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      return buildSummaries(repos, goals, ctx.today, profile.timeZone);
    }),
  );
}

export async function getGoalDetail(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<GoalDetailDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { goalId } = goalIdSchema.parse(input);
      const goal = await repos.goals.findById(ctx.userId, goalId);
      if (!goal) throw notFound();
      return loadGoalDetail(repos, goal, ctx.today);
    }),
  );
}

export async function getGoalHistory(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<GoalEventDTO[]>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { goalId, limit, before } = goalHistorySchema.parse(input);
      const goal = await repos.goals.findById(ctx.userId, goalId);
      if (!goal) throw notFound();
      const events = await repos.events.listByGoal(goalId, { limit, before: before ? new Date(before) : undefined });
      return events.map(eventDTO);
    }),
  );
}

export async function listReflections(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<ReflectionDTO[]>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { goalId, limit, before } = listReflectionsSchema.parse(input);
      const goal = await repos.goals.findById(ctx.userId, goalId);
      if (!goal) throw notFound();
      return (await repos.reflections.listByGoal(goalId, { limit, before })).map(reflectionDTO);
    }),
  );
}

/** Weekly routines have no fixed scheduled days, so their `scheduledDates` is empty. */
function scheduledDates(a: Action, days: string[]): string[] {
  const start = a.startDate;
  if (!start || !a.schedule) return [];
  const eligible = days.filter((d) => d >= start);
  if (a.schedule.type === 'daily') return eligible;
  if (a.schedule.type === 'weekdays') {
    const set = a.schedule.days;
    return eligible.filter((d) => set.includes(weekdayOf(d)));
  }
  return [];
}

export async function getRoutineSheet(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<RoutineSheetDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { goalId, month } = routineSheetSchema.parse(input);
      const goal = await repos.goals.findById(ctx.userId, goalId);
      if (!goal) throw notFound();
      const days = monthDays(month);
      const [outcomes, actions] = await Promise.all([
        repos.outcomes.listByGoals([goalId]),
        repos.actions.listByGoals([goalId]),
      ]);
      const activeOutcomes = new Map(outcomes.filter((o) => o.archivedAt === null).map((o) => [o.id, o]));
      const routines = actions
        .filter((a) => a.kind === 'routine' && a.archivedAt === null && activeOutcomes.has(a.outcomeId))
        .sort(
          (a, b) =>
            (activeOutcomes.get(a.outcomeId)!.position ?? 99) - (activeOutcomes.get(b.outcomeId)!.position ?? 99) ||
            (a.position ?? 99) - (b.position ?? 99),
        );
      const checks = routines.length
        ? await repos.checks.listForActions(routines.map((r) => r.id), days[0]!, days[days.length - 1]!)
        : [];
      return {
        month,
        today: ctx.today,
        rows: routines.map((a) => ({
          action: { ...actionFieldsDTO(a), outcomeTitle: activeOutcomes.get(a.outcomeId)!.title },
          scheduledDates: scheduledDates(a, days),
          checkedDates: checks.filter((c) => c.actionId === a.id).map((c) => c.date).sort(),
        })),
      };
    }),
  );
}

export async function listTemplates(deps: Deps, _ctx?: Ctx, _input?: unknown): Promise<Result<TemplateSummaryDTO[]>> {
  return guard(deps.logger, async () =>
    TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      summary: t.summary,
      outcomeCount: t.outcomes.length,
      actionCount: t.outcomes.reduce((n, o) => n + o.actions.length, 0),
    })),
  );
}
