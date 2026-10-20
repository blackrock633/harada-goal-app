import {
  archiveAction as domainArchive,
  completeTask,
  computeReorder,
  createAction,
  moveAction as domainMove,
  reopenTask,
  restoreAction as domainRestore,
  updateAction as domainUpdate,
  validateCheckDate,
} from '@/domain/action';
import { MAX_ACTIONS_PER_OUTCOME } from '@/domain/limits';
import type { Action, Outcome } from '@/domain/types';
import type { ActionDTO, GoalDetailDTO, OutcomeDTO } from '../dto';
import { AppFail, STALE_MESSAGE, guard, notFound } from '../errors';
import type { Deps, Repos } from '../ports';
import type { Ctx, Result } from '../result';
import {
  actionIdSchema,
  addActionSchema,
  moveActionSchema,
  reorderActionsSchema,
  routineCheckSchema,
  updateActionSchema,
} from '../schemas';
import { loadActionDTO, loadGoalDetail, loadOutcomeDTO } from '../queries/assemble';
import { appendEvent, assertFresh, assertSlotAvailable, changedList, lockGoal } from './shared';

async function actionWithGoal(repos: Repos, ctx: Ctx, actionId: string) {
  const found = await repos.actions.findById(ctx.userId, actionId);
  if (!found) throw notFound();
  const goal = await lockGoal(repos, ctx, found.goalId);
  const action = (await repos.actions.findById(ctx.userId, actionId)) ?? found;
  return { goal, action };
}

const activeIn = (actions: Action[], outcomeId: string) =>
  actions.filter((a) => a.outcomeId === outcomeId && a.archivedAt === null);

async function ownedOutcome(repos: Repos, ctx: Ctx, outcomeId: string): Promise<Outcome> {
  const o = await repos.outcomes.findById(ctx.userId, outcomeId);
  if (!o) throw notFound();
  return o;
}

export async function addAction(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<ActionDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const data = addActionSchema.parse(input);
      const outcome = await ownedOutcome(repos, ctx, data.outcomeId);
      const goal = await lockGoal(repos, ctx, outcome.goalId);
      if (data.id) {
        const existing = await repos.actions.findById(ctx.userId, data.id);
        if (existing) {
          if (existing.outcomeId !== outcome.id) throw new AppFail('CONFLICT', STALE_MESSAGE);
          return loadActionDTO(repos, existing, ctx.today);
        }
      }
      if (outcome.archivedAt !== null) throw new AppFail('INVALID_STATE', 'Cannot add actions to an archived outcome');
      const siblings = activeIn(await repos.actions.listByGoals([goal.id]), outcome.id);
      if (siblings.length < MAX_ACTIONS_PER_OUTCOME) assertSlotAvailable(siblings.map((a) => a.position), data.position);
      const action = createAction(
        {
          id: data.id ?? deps.ids(),
          goalId: goal.id,
          outcomeId: outcome.id,
          title: data.title,
          notes: data.notes,
          kind: data.kind,
          dueDate: data.dueDate,
          schedule: data.schedule as Action['schedule'],
          position: data.position,
        },
        siblings,
        ctx.today,
        ctx.now,
      );
      await repos.actions.insert(action);
      await appendEvent(repos, deps, ctx, goal.id, 'action_added', action.id, `Added action "${action.title}"`, {
        outcomeId: outcome.id,
        position: action.position,
      });
      return loadActionDTO(repos, action, ctx.today);
    }),
  );
}

export async function updateAction(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<ActionDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { actionId, expectedUpdatedAt, ...patch } = updateActionSchema.parse(input);
      const { goal, action } = await actionWithGoal(repos, ctx, actionId);
      assertFresh(action.updatedAt, expectedUpdatedAt);
      const { action: next, changed } = domainUpdate(action, patch as Parameters<typeof domainUpdate>[1], ctx.today, ctx.now);
      if (changed.length > 0 || next.updatedAt !== action.updatedAt) {
        await repos.actions.update(next);
        await appendEvent(repos, deps, ctx, goal.id, 'action_updated', actionId, `Updated action: ${changedList(changed)}`, {
          changed,
        });
      }
      return loadActionDTO(repos, next, ctx.today);
    }),
  );
}

function taskToggle(kind: 'complete' | 'reopen') {
  return async (deps: Deps, ctx: Ctx, input: unknown): Promise<Result<ActionDTO>> =>
    guard(deps.logger, () =>
      deps.uow.run(ctx.userId, async (repos) => {
        const { actionId } = actionIdSchema.parse(input);
        const found = await repos.actions.findById(ctx.userId, actionId);
        if (!found) throw notFound();
        const goal = await repos.goals.findById(ctx.userId, found.goalId);
        if (!goal) throw notFound();
        if (goal.status === 'archived') throw new AppFail('INVALID_STATE', 'Goal is archived and cannot be edited');
        let next = found;
        if (kind === 'complete') {
          const r = completeTask(found, ctx.now);
          next = r.action;
          if (r.changed) {
            await repos.actions.update(next);
            await appendEvent(repos, deps, ctx, goal.id, 'action_completed', actionId, `Completed "${found.title}"`);
          }
        } else {
          next = reopenTask(found, ctx.now);
          if (next !== found) {
            await repos.actions.update(next);
            await appendEvent(repos, deps, ctx, goal.id, 'action_reopened', actionId, `Reopened "${found.title}"`);
          }
        }
        return loadActionDTO(repos, next, ctx.today);
      }),
    );
}
export const completeAction = taskToggle('complete');
export const reopenAction = taskToggle('reopen');

function routineToggle(add: boolean) {
  return async (deps: Deps, ctx: Ctx, input: unknown): Promise<Result<ActionDTO>> =>
    guard(deps.logger, () =>
      deps.uow.run(ctx.userId, async (repos) => {
        const { actionId, date } = routineCheckSchema.parse(input);
        const action = await repos.actions.findById(ctx.userId, actionId);
        if (!action) throw notFound();
        const goal = await repos.goals.findById(ctx.userId, action.goalId);
        if (!goal) throw notFound();
        if (goal.status === 'archived') throw new AppFail('INVALID_STATE', 'Goal is archived and cannot be edited');
        validateCheckDate(action, date, ctx.today);
        if (add) await repos.checks.add({ id: deps.ids(), actionId, date, createdAt: ctx.now });
        else await repos.checks.remove(actionId, date);
        return loadActionDTO(repos, action, ctx.today);
      }),
    );
}
export const checkRoutine = routineToggle(true);
export const uncheckRoutine = routineToggle(false);

export async function archiveAction(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<GoalDetailDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { actionId } = actionIdSchema.parse(input);
      const { goal, action } = await actionWithGoal(repos, ctx, actionId);
      const { action: next } = domainArchive(action, [], ctx.now);
      if (next !== action) {
        await repos.actions.update(next);
        await appendEvent(repos, deps, ctx, goal.id, 'action_archived', actionId, `Archived "${action.title}"`);
      }
      return loadGoalDetail(repos, goal, ctx.today);
    }),
  );
}

export async function restoreAction(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<GoalDetailDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { actionId } = actionIdSchema.parse(input);
      const { goal, action } = await actionWithGoal(repos, ctx, actionId);
      const outcome = await ownedOutcome(repos, ctx, action.outcomeId);
      if (outcome.archivedAt !== null) {
        throw new AppFail('INVALID_STATE', 'Restore the outcome first, then restore this action');
      }
      const siblings = activeIn(await repos.actions.listByGoals([goal.id]), outcome.id);
      const next = domainRestore(action, siblings, ctx.now);
      if (next !== action) {
        await repos.actions.update(next);
        await appendEvent(repos, deps, ctx, goal.id, 'action_restored', actionId, `Restored "${action.title}"`, {
          position: next.position,
        });
      }
      return loadGoalDetail(repos, goal, ctx.today);
    }),
  );
}

export async function moveAction(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<GoalDetailDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { actionId, toOutcomeId, toPosition } = moveActionSchema.parse(input);
      const { goal, action } = await actionWithGoal(repos, ctx, actionId);
      const toOutcome = await ownedOutcome(repos, ctx, toOutcomeId);
      const all = await repos.actions.listByGoals([goal.id]);
      const toSiblings = activeIn(all, toOutcomeId).filter((a) => a.id !== actionId);
      if (toOutcome.goalId === goal.id && toOutcome.archivedAt === null && (toOutcomeId !== action.outcomeId || toPosition !== action.position)) {
        if (toOutcomeId === action.outcomeId || toSiblings.length < MAX_ACTIONS_PER_OUTCOME) {
          assertSlotAvailable(toSiblings.map((a) => a.position), toPosition);
        }
      }
      const { action: next } = domainMove(action, activeIn(all, action.outcomeId), toSiblings, toOutcome, toPosition, ctx.now);
      if (next !== action) {
        await repos.actions.update(next);
        await appendEvent(repos, deps, ctx, goal.id, 'action_moved', actionId, `Moved "${action.title}"`, {
          fromOutcomeId: action.outcomeId,
          toOutcomeId,
          toPosition,
        });
      }
      return loadGoalDetail(repos, goal, ctx.today);
    }),
  );
}

export async function reorderActions(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<OutcomeDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { outcomeId, orderedIds } = reorderActionsSchema.parse(input);
      const outcome = await ownedOutcome(repos, ctx, outcomeId);
      const goal = await lockGoal(repos, ctx, outcome.goalId);
      const active = activeIn(await repos.actions.listByGoals([goal.id]), outcomeId);
      const updates = computeReorder(active, orderedIds);
      if (!updates) throw new AppFail('CONFLICT', STALE_MESSAGE);
      await repos.actions.setPositions(goal.id, updates.map((u) => ({ ...u, outcomeId })));
      await appendEvent(repos, deps, ctx, goal.id, 'actions_reordered', outcomeId, 'Reordered actions', { orderedIds });
      return loadOutcomeDTO(repos, goal, outcomeId, ctx.today);
    }),
  );
}
