import { computeReorder } from '@/domain/action';
import { assertGoalEditable } from '@/domain/goal';
import { MAX_OUTCOMES_PER_GOAL } from '@/domain/limits';
import {
  archiveOutcome as domainArchive,
  createOutcome,
  restoreOutcome as domainRestore,
  setMeasureCurrent,
  updateOutcome as domainUpdate,
} from '@/domain/outcome';
import type { GoalDetailDTO, OutcomeDTO } from '../dto';
import { AppFail, STALE_MESSAGE, guard, notFound } from '../errors';
import type { Deps, Repos } from '../ports';
import type { Ctx, Result } from '../result';
import {
  addOutcomeSchema,
  outcomeIdSchema,
  reorderOutcomesSchema,
  updateMeasureCurrentSchema,
  updateOutcomeSchema,
} from '../schemas';
import { loadGoalDetail, loadOutcomeDTO } from '../queries/assemble';
import { appendEvent, assertFresh, assertSlotAvailable, changedList, lockGoal } from './shared';

/** Loads an owned outcome, then locks its goal (lock order: goal always before children). */
async function outcomeWithGoal(repos: Repos, ctx: Ctx, outcomeId: string) {
  const found = await repos.outcomes.findById(ctx.userId, outcomeId);
  if (!found) throw notFound();
  const goal = await lockGoal(repos, ctx, found.goalId);
  const outcome = (await repos.outcomes.findById(ctx.userId, outcomeId)) ?? found;
  return { goal, outcome };
}

export async function addOutcome(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<OutcomeDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const data = addOutcomeSchema.parse(input);
      const goal = await lockGoal(repos, ctx, data.goalId, { editable: false });
      if (data.id) {
        const existing = await repos.outcomes.findById(ctx.userId, data.id);
        if (existing) {
          if (existing.goalId !== goal.id) throw new AppFail('CONFLICT', STALE_MESSAGE);
          return loadOutcomeDTO(repos, ctx.userId, goal, existing.id, ctx.today);
        }
      }
      assertGoalEditable(goal);
      const active = (await repos.outcomes.listByGoals([goal.id])).filter((o) => o.archivedAt === null);
      if (active.length < MAX_OUTCOMES_PER_GOAL) assertSlotAvailable(active.map((o) => o.position), data.position);
      const outcome = createOutcome(
        {
          id: data.id ?? deps.ids(),
          goalId: goal.id,
          title: data.title,
          description: data.description,
          measure: data.measure,
          position: data.position,
        },
        active,
        ctx.now,
      );
      await repos.outcomes.insert(outcome);
      await appendEvent(repos, deps, ctx, goal.id, 'outcome_added', outcome.id, `Added outcome "${outcome.title}"`, {
        position: outcome.position,
      });
      return loadOutcomeDTO(repos, ctx.userId, goal, outcome.id, ctx.today);
    }),
  );
}

export async function updateOutcome(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<OutcomeDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { outcomeId, expectedUpdatedAt, ...patch } = updateOutcomeSchema.parse(input);
      const { goal, outcome } = await outcomeWithGoal(repos, ctx, outcomeId);
      assertFresh(outcome.updatedAt, expectedUpdatedAt);
      const { outcome: next, changed } = domainUpdate(outcome, patch, ctx.now);
      if (changed.length > 0) {
        await repos.outcomes.update(next);
        await appendEvent(repos, deps, ctx, goal.id, 'outcome_updated', outcomeId, `Updated outcome: ${changedList(changed)}`, {
          changed,
        });
      }
      return loadOutcomeDTO(repos, ctx.userId, goal, outcomeId, ctx.today);
    }),
  );
}

export async function updateMeasureCurrent(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<OutcomeDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { outcomeId, current } = updateMeasureCurrentSchema.parse(input);
      const { goal, outcome } = await outcomeWithGoal(repos, ctx, outcomeId);
      const { outcome: next, from, to } = setMeasureCurrent(outcome, current, ctx.now);
      if (from !== to) {
        await repos.outcomes.update(next);
        await appendEvent(repos, deps, ctx, goal.id, 'measure_updated', outcomeId, `Progress ${from} → ${to}`, { from, to });
      }
      return loadOutcomeDTO(repos, ctx.userId, goal, outcomeId, ctx.today);
    }),
  );
}

export async function archiveOutcome(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<GoalDetailDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { outcomeId } = outcomeIdSchema.parse(input);
      const { goal, outcome } = await outcomeWithGoal(repos, ctx, outcomeId);
      const { outcome: next } = domainArchive(outcome, [], ctx.now);
      if (next !== outcome) {
        await repos.outcomes.update(next);
        await appendEvent(repos, deps, ctx, goal.id, 'outcome_archived', outcomeId, `Archived outcome "${outcome.title}"`);
      }
      return loadGoalDetail(repos, ctx.userId, goal, ctx.today);
    }),
  );
}

export async function restoreOutcome(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<GoalDetailDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { outcomeId } = outcomeIdSchema.parse(input);
      const { goal, outcome } = await outcomeWithGoal(repos, ctx, outcomeId);
      const active = (await repos.outcomes.listByGoals([goal.id])).filter((o) => o.archivedAt === null);
      const next = domainRestore(outcome, active, ctx.now);
      if (next !== outcome) {
        await repos.outcomes.update(next);
        await appendEvent(repos, deps, ctx, goal.id, 'outcome_restored', outcomeId, `Restored outcome "${outcome.title}"`, {
          position: next.position,
        });
      }
      return loadGoalDetail(repos, ctx.userId, goal, ctx.today);
    }),
  );
}

export async function reorderOutcomes(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<GoalDetailDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { goalId, orderedIds } = reorderOutcomesSchema.parse(input);
      const goal = await lockGoal(repos, ctx, goalId);
      const active = (await repos.outcomes.listByGoals([goalId])).filter((o) => o.archivedAt === null);
      const updates = computeReorder(active, orderedIds);
      if (!updates) throw new AppFail('CONFLICT', STALE_MESSAGE);
      await repos.outcomes.setPositions(goalId, updates);
      await appendEvent(repos, deps, ctx, goalId, 'outcomes_reordered', null, 'Reordered outcomes', { orderedIds });
      return loadGoalDetail(repos, ctx.userId, goal, ctx.today);
    }),
  );
}
