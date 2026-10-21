/**
 * Read-side loading for the server: batched repository reads (no N+1) fed into the pure read model.
 * Used by queries and by commands that return a refreshed GoalDetailDTO / OutcomeDTO / ActionDTO.
 */
import type { Action, Goal, Id, LocalDate } from '../../domain/types.js';
import { MAX_ACTIONS_PER_OUTCOME } from '../../domain/limits.js';
import type { Repos } from '../ports';
import type { ActionDTO, GoalDetailDTO, GoalSummaryDTO, OutcomeDTO } from '../dto';
import {
  actionDTO,
  buildGoalDetail,
  buildGraph,
  buildSummaryDTOs,
  checksFrom,
  outcomeFieldsDTO,
  type Graph,
} from '../read-model';

export * from '../read-model';

/** 2 batched queries for structure + 1 for recent checks of active actions. */
export async function loadGraph(repos: Repos, ownerId: Id, goalIds: Id[], today: LocalDate): Promise<Graph> {
  const focusRows = await repos.focus.listForDate(ownerId, today);
  if (goalIds.length === 0) return buildGraph([], [], [], focusRows, today);
  const [outcomes, actions] = await Promise.all([
    repos.outcomes.listByGoals(goalIds),
    repos.actions.listByGoals(goalIds),
  ]);
  const routineIds = actions.filter((a) => a.archivedAt === null && a.kind === 'routine').map((a) => a.id);
  const rows = routineIds.length ? await repos.checks.listForActions(routineIds, checksFrom(today), today) : [];
  return buildGraph(outcomes, actions, rows, focusRows, today);
}

export async function loadGoalDetail(repos: Repos, ownerId: Id, goal: Goal, today: LocalDate): Promise<GoalDetailDTO> {
  return buildGoalDetail(goal, await loadGraph(repos, ownerId, [goal.id], today), today);
}

/** An archived outcome (e.g. an idempotent replay) maps to a DTO with no actions. */
export async function loadOutcomeDTO(
  repos: Repos,
  ownerId: Id,
  goal: Goal,
  outcomeId: Id,
  today: LocalDate,
): Promise<OutcomeDTO> {
  const detail = await loadGoalDetail(repos, ownerId, goal, today);
  const found = detail.outcomes.find((o) => o.id === outcomeId);
  if (found) return found;
  const outcome = await repos.outcomes.findById(ownerId, outcomeId);
  if (!outcome) throw new Error('Outcome missing after write');
  return {
    ...outcomeFieldsDTO(outcome),
    taskCompletion: null,
    completedTasks: 0,
    totalTasks: 0,
    routineAdherence: null,
    routineCount: 0,
    attainment: null,
    actions: [],
    slots: Array.from({ length: MAX_ACTIONS_PER_OUTCOME }, () => null),
  };
}

export async function loadActionDTO(repos: Repos, ownerId: Id, action: Action, today: LocalDate): Promise<ActionDTO> {
  const [rows, focus] = await Promise.all([
    action.kind === 'routine'
      ? repos.checks.listForActions([action.id], checksFrom(today), today)
      : Promise.resolve([]),
    repos.focus.listForDate(ownerId, today),
  ]);
  return actionDTO(action, rows.map((c) => c.date), today, focus.some((f) => f.actionId === action.id));
}

/** Summaries for many goals using batched queries only. */
export async function buildSummaries(
  repos: Repos,
  ownerId: Id,
  goals: Goal[],
  today: LocalDate,
  timeZone: string,
  graph?: Graph,
): Promise<GoalSummaryDTO[]> {
  if (goals.length === 0) return [];
  const ids = goals.map((g) => g.id);
  const [g, lastReflected] = await Promise.all([
    graph ?? loadGraph(repos, ownerId, ids, today),
    repos.reflections.latestDateByGoals(ids),
  ]);
  return buildSummaryDTOs(goals, g, lastReflected, today, timeZone);
}
