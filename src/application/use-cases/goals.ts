import {
  activateGoal as domainActivate,
  archiveGoal as domainArchive,
  assertPermanentDeleteAllowed,
  createGoal as domainCreateGoal,
  markGoalAchieved as domainAchieve,
  reopenGoal as domainReopen,
  restoreGoal as domainRestore,
  updateGoalDetails,
} from '@/domain/goal';
import { TEMPLATES, instantiateTemplate } from '@/domain/templates';
import type { Goal } from '@/domain/types';
import type { GoalDetailDTO } from '../dto';
import { guard, notFound } from '../errors';
import type { Deps, Repos } from '../ports';
import type { Ctx, Result } from '../result';
import {
  createGoalFromTemplateSchema,
  createGoalSchema,
  deleteGoalPermanentlySchema,
  goalIdSchema,
  updateGoalSchema,
} from '../schemas';
import { loadGoalDetail } from '../queries/assemble';
import { appendEvent, assertFresh, changedList, lockGoal } from './shared';

/** Idempotent create (M-07): an existing goal with this id owned by the caller is returned as-is. */
async function existingGoal(repos: Repos, ctx: Ctx, id: string | undefined): Promise<Goal | null> {
  return id ? repos.goals.findById(ctx.userId, id) : null;
}

export async function createGoal(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<GoalDetailDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const data = createGoalSchema.parse(input);
      const existing = await existingGoal(repos, ctx, data.id);
      if (existing) return loadGoalDetail(repos, existing, ctx.today);
      const goal = domainCreateGoal(
        {
          id: data.id ?? deps.ids(),
          ownerId: ctx.userId,
          title: data.title,
          vision: data.vision,
          successCriteria: data.successCriteria,
          targetDate: data.targetDate,
          purpose: data.purpose,
        },
        ctx.now,
      );
      await repos.goals.insert(goal);
      await appendEvent(repos, deps, ctx, goal.id, 'goal_created', goal.id, `Created goal "${goal.title}"`);
      return loadGoalDetail(repos, goal, ctx.today);
    }),
  );
}

export async function createGoalFromTemplate(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<GoalDetailDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const data = createGoalFromTemplateSchema.parse(input);
      if (!TEMPLATES.some((t) => t.id === data.templateId)) throw notFound('Template not found');
      const existing = await existingGoal(repos, ctx, data.id);
      if (existing) return loadGoalDetail(repos, existing, ctx.today);
      let firstId = data.id;
      const ids = () => {
        if (firstId) {
          const v = firstId;
          firstId = undefined;
          return v;
        }
        return deps.ids();
      };
      const plan = instantiateTemplate(data.templateId, { ownerId: ctx.userId, ids, today: ctx.today, now: ctx.now });
      await repos.goals.insert(plan.goal);
      for (const o of plan.outcomes) await repos.outcomes.insert(o);
      for (const a of plan.actions) await repos.actions.insert(a);
      await appendEvent(repos, deps, ctx, plan.goal.id, 'goal_created', plan.goal.id, `Created goal "${plan.goal.title}" from a template`, {
        templateId: data.templateId,
      });
      return loadGoalDetail(repos, plan.goal, ctx.today);
    }),
  );
}

export async function updateGoal(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<GoalDetailDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { goalId, expectedUpdatedAt, ...patch } = updateGoalSchema.parse(input);
      const goal = await lockGoal(repos, ctx, goalId);
      assertFresh(goal.updatedAt, expectedUpdatedAt);
      const { goal: next, changed } = updateGoalDetails(goal, patch, ctx.now);
      if (changed.length > 0) {
        await repos.goals.update(next);
        await appendEvent(repos, deps, ctx, goalId, 'goal_updated', goalId, `Updated ${changedList(changed)}`, { changed });
      }
      return loadGoalDetail(repos, next, ctx.today);
    }),
  );
}

type Transition = {
  event: Parameters<typeof appendEvent>[4];
  summary: string;
  apply: (goal: Goal, repos: Repos, ctx: Ctx) => Promise<Goal> | Goal;
};

const transitions = {
  activateGoal: {
    event: 'goal_activated',
    summary: 'Activated goal',
    async apply(goal, repos, ctx) {
      const [outcomes, actions] = await Promise.all([
        repos.outcomes.listByGoals([goal.id]),
        repos.actions.listByGoals([goal.id]),
      ]);
      const activeOutcomes = outcomes.filter((o) => o.archivedAt === null);
      const ids = new Set(activeOutcomes.map((o) => o.id));
      const activeActions = actions.filter((a) => a.archivedAt === null && ids.has(a.outcomeId));
      return domainActivate(
        goal,
        { activeOutcomes: activeOutcomes.length, activeActions: activeActions.length },
        ctx.today,
        ctx.now,
      );
    },
  },
  markGoalAchieved: { event: 'goal_achieved', summary: 'Marked goal achieved', apply: (g, _r, c) => domainAchieve(g, c.now) },
  reopenGoal: { event: 'goal_reopened', summary: 'Reopened goal', apply: (g, _r, c) => domainReopen(g, c.now) },
  archiveGoal: { event: 'goal_archived', summary: 'Archived goal', apply: (g, _r, c) => domainArchive(g, c.now) },
  restoreGoal: { event: 'goal_restored', summary: 'Restored goal', apply: (g, _r, c) => domainRestore(g, c.now) },
} satisfies Record<string, Transition>;

function transitionUseCase(name: keyof typeof transitions) {
  const t: Transition = transitions[name];
  return async (deps: Deps, ctx: Ctx, input: unknown): Promise<Result<GoalDetailDTO>> =>
    guard(deps.logger, () =>
      deps.uow.run(ctx.userId, async (repos) => {
        const { goalId } = goalIdSchema.parse(input);
        const goal = await lockGoal(repos, ctx, goalId, { editable: false });
        const next = await t.apply(goal, repos, ctx);
        if (next !== goal) {
          await repos.goals.update(next);
          await appendEvent(repos, deps, ctx, goalId, t.event, goalId, t.summary);
        }
        return loadGoalDetail(repos, next, ctx.today);
      }),
    );
}

export const activateGoal = transitionUseCase('activateGoal');
export const markGoalAchieved = transitionUseCase('markGoalAchieved');
export const reopenGoal = transitionUseCase('reopenGoal');
export const archiveGoal = transitionUseCase('archiveGoal');
export const restoreGoal = transitionUseCase('restoreGoal');

export async function deleteGoalPermanently(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<null>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { goalId, confirmTitle } = deleteGoalPermanentlySchema.parse(input);
      const goal = await lockGoal(repos, ctx, goalId, { editable: false });
      assertPermanentDeleteAllowed(goal, confirmTitle);
      await repos.goals.deleteById(ctx.userId, goalId);
      return null;
    }),
  );
}
