/**
 * Pure async loaders for the native read path (API_CONTRACTS §7). Each takes a SupabaseClient, so
 * they are unit-testable with a fake. They select `SELECT_COLUMNS[table]` (never `*`), map rows with
 * rows.ts and build DTOs with the shared read model, loading the same rows the web server's
 * loaders do (src/application/queries/{assemble,today,goals}.ts).
 *
 * Failures throw QueryError carrying an AppError, so screens can render ErrorState with retry.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppError } from '@shared/application/result';
import type { GoalDetailDTO, GoalEventDTO, GoalSummaryDTO, ReflectionDTO, TodayDTO } from '@shared/application/dto';
import {
  actionFromRow,
  dailyFocusFromRow,
  goalEventFromRow,
  goalFromRow,
  outcomeFromRow,
  reflectionFromRow,
  routineCheckFromRow,
  SELECT_COLUMNS,
  type ActionRow,
  type DailyFocusRow,
  type GoalEventRow,
  type GoalRow,
  type OutcomeRow,
  type ProfileRow,
  type ReflectionRow,
  type RoutineCheckRow,
} from '@shared/application/rows';
import {
  buildGoalDetail,
  buildGraph,
  buildSummaryDTOs,
  buildTodayDTO,
  checksFrom,
  eventDTO,
  reflectionDTO,
  type Graph,
} from '@shared/application/read-model';
import { localDateInZone } from '@shared/domain/dates';

import { thrownToAppError, toAppError, type PostgrestLikeError } from './rpc-errors';

/** Thrown by every loader. `appError.code` tells the screen what happened (NOT_FOUND, UNAVAILABLE...). */
export class QueryError extends Error {
  constructor(readonly appError: AppError) {
    super(appError.message);
    this.name = 'QueryError';
  }
}

export function asQueryError(e: unknown): QueryError {
  return e instanceof QueryError ? e : new QueryError(thrownToAppError());
}

export const REFLECTION_LIMIT = 30;
export const EVENT_LIMIT = 50;

export interface Profile {
  id: string;
  displayName: string;
  timeZone: string;
  /** The user's local date right now (profile time zone). Computed when loaded. */
  today: string;
}

/** What the date-dependent loaders need. */
export interface ReadContext {
  today: string;
  timeZone: string;
}

type Table = keyof typeof SELECT_COLUMNS;
interface Response {
  data: unknown;
  error: PostgrestLikeError | null;
  status: number;
}
/** The slice of supabase-js's filter builder used here. */
export interface Filter extends PromiseLike<Response> {
  eq(column: string, value: unknown): Filter;
  in(column: string, values: unknown[]): Filter;
  gte(column: string, value: unknown): Filter;
  order(column: string, options?: { ascending?: boolean }): Filter;
  limit(count: number): Filter;
}

async function fetchRows<T>(
  supabase: SupabaseClient,
  table: Table,
  refine: (q: Filter) => Filter = (q) => q,
): Promise<T[]> {
  let res: Response;
  try {
    res = await refine(supabase.from(table).select(SELECT_COLUMNS[table]) as unknown as Filter);
  } catch {
    throw new QueryError(thrownToAppError());
  }
  if (res.error) throw new QueryError(toAppError(res.error, res.status));
  return (res.data ?? []) as T[];
}

const notFound = () => new QueryError({ code: 'NOT_FOUND', message: "That item doesn't exist or isn't yours." });

// ---------- profile ----------

export async function loadProfile(supabase: SupabaseClient, now: Date = new Date()): Promise<Profile> {
  const [row] = await fetchRows<ProfileRow>(supabase, 'profiles', (q) => q.limit(1));
  if (!row) throw new QueryError({ code: 'UNAUTHENTICATED', message: 'Please sign in again.' });
  return { id: row.id, displayName: row.display_name, timeZone: row.time_zone, today: localDateInZone(now, row.time_zone) };
}

// ---------- graph ----------

async function loadStructure(supabase: SupabaseClient, goalIds: string[]) {
  const [outcomeRows, actionRows] = await Promise.all([
    fetchRows<OutcomeRow>(supabase, 'outcomes', (q) =>
      q.in('goal_id', goalIds).order('position', { ascending: true }).order('created_at', { ascending: true }),
    ),
    fetchRows<ActionRow>(supabase, 'actions', (q) =>
      q
        .in('goal_id', goalIds)
        .order('outcome_id', { ascending: true })
        .order('position', { ascending: true })
        .order('created_at', { ascending: true }),
    ),
  ]);
  return { outcomes: outcomeRows.map(outcomeFromRow), actions: actionRows.map(actionFromRow) };
}

/** Mirrors the web `loadGraph`: structure for `goalIds`, recent checks of live routines, today's focus. */
export async function loadGraph(supabase: SupabaseClient, goalIds: string[], today: string): Promise<Graph> {
  const focusPromise = fetchRows<DailyFocusRow>(supabase, 'daily_focus', (q) =>
    q.eq('date', today).order('slot', { ascending: true }),
  );
  if (goalIds.length === 0) return buildGraph([], [], [], (await focusPromise).map(dailyFocusFromRow), today);
  const [focusRows, { outcomes, actions }] = await Promise.all([focusPromise, loadStructure(supabase, goalIds)]);
  const routineIds = actions.filter((a) => a.archivedAt === null && a.kind === 'routine').map((a) => a.id);
  const checkRows = routineIds.length
    ? await fetchRows<RoutineCheckRow>(supabase, 'routine_checks', (q) =>
        q.in('action_id', routineIds).gte('date', checksFrom(today)).order('date', { ascending: true }),
      )
    : [];
  return buildGraph(outcomes, actions, checkRows.map(routineCheckFromRow), focusRows.map(dailyFocusFromRow), today);
}

/**
 * Latest reflection date per goal. PostgREST has no GROUP BY, so rows are read newest first and the
 * first one per goal wins (columns goal_id,date only).
 */
export async function loadLastReflected(supabase: SupabaseClient, goalIds: string[]): Promise<Record<string, string>> {
  if (goalIds.length === 0) return {};
  const rows = await fetchRows<Pick<ReflectionRow, 'goal_id' | 'date'>>(supabase, 'reflections', (q) =>
    q.in('goal_id', goalIds).order('date', { ascending: false }),
  );
  const out: Record<string, string> = {};
  for (const r of rows) if (!(r.goal_id in out)) out[r.goal_id] = r.date;
  return out;
}

const loadGoalRows = async (supabase: SupabaseClient) =>
  (await fetchRows<GoalRow>(supabase, 'goals', (q) => q.order('created_at', { ascending: true }))).map(goalFromRow);

// ---------- screens ----------

/** Today: all goals; outcomes/actions/checks for active+draft goals; today's focus; reflection recency. */
export async function loadToday(supabase: SupabaseClient, ctx: ReadContext): Promise<TodayDTO> {
  const goals = await loadGoalRows(supabase);
  const liveIds = goals.filter((g) => g.status === 'active' || g.status === 'draft').map((g) => g.id);
  const [graph, lastReflected] = await Promise.all([
    loadGraph(supabase, liveIds, ctx.today),
    loadLastReflected(supabase, liveIds),
  ]);
  return buildTodayDTO(goals, graph, lastReflected, ctx.today, ctx.timeZone);
}

/** Goal summaries for every goal (all statuses), most recently updated first, like the web listGoals. */
export async function loadGoals(supabase: SupabaseClient, ctx: ReadContext): Promise<GoalSummaryDTO[]> {
  const goals = await loadGoalRows(supabase);
  goals.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  if (goals.length === 0) return [];
  const ids = goals.map((g) => g.id);
  const [graph, lastReflected] = await Promise.all([loadGraph(supabase, ids, ctx.today), loadLastReflected(supabase, ids)]);
  return buildSummaryDTOs(goals, graph, lastReflected, ctx.today, ctx.timeZone);
}

async function loadGoalById(supabase: SupabaseClient, goalId: string) {
  const [row] = await fetchRows<GoalRow>(supabase, 'goals', (q) => q.eq('id', goalId).limit(1));
  if (!row) throw notFound(); // RLS hides other users' rows, so "missing" and "not yours" look the same
  return goalFromRow(row);
}

export async function loadGoalDetail(supabase: SupabaseClient, goalId: string, ctx: ReadContext): Promise<GoalDetailDTO> {
  const goal = await loadGoalById(supabase, goalId);
  return buildGoalDetail(goal, await loadGraph(supabase, [goal.id], ctx.today), ctx.today);
}

export interface ReviewData {
  /** Latest 30, newest first. */
  reflections: ReflectionDTO[];
  /** Latest 50, newest first. */
  events: GoalEventDTO[];
  /** Tasks completed in the current ISO week, from the goal's summary. */
  completedThisWeek: number;
}

export async function loadReview(supabase: SupabaseClient, goalId: string, ctx: ReadContext): Promise<ReviewData> {
  const goal = await loadGoalById(supabase, goalId);
  const [reflectionRows, eventRows, structure] = await Promise.all([
    fetchRows<ReflectionRow>(supabase, 'reflections', (q) =>
      q
        .eq('goal_id', goalId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(REFLECTION_LIMIT),
    ),
    fetchRows<GoalEventRow>(supabase, 'goal_events', (q) =>
      q.eq('goal_id', goalId).order('occurred_at', { ascending: false }).limit(EVENT_LIMIT),
    ),
    loadStructure(supabase, [goalId]),
  ]);
  const reflections = reflectionRows.map(reflectionFromRow);
  // completedThisWeek only depends on the goal's actions, so checks and focus are not loaded.
  const graph = buildGraph(structure.outcomes, structure.actions, [], [], ctx.today);
  const [summary] = buildSummaryDTOs([goal], graph, {}, ctx.today, ctx.timeZone);
  return {
    reflections: reflections.map(reflectionDTO),
    events: eventRows.map(goalEventFromRow).map(eventDTO),
    completedThisWeek: summary!.completedThisWeek,
  };
}

/**
 * Which goal a goal-scoped screen shows. Same rule as the web's pickDefaultGoal/resolveFocusedGoal:
 * archived goals are never chosen; the requested id if present, else the most recently activated
 * active goal, else the newest draft, else an achieved goal.
 */
export function focusedGoal(goals: GoalSummaryDTO[], requestedId?: string | null): GoalSummaryDTO | undefined {
  const visible = goals.filter((g) => g.status !== 'archived');
  const wanted = requestedId ? visible.find((g) => g.id === requestedId) : undefined;
  if (wanted) return wanted;
  const by = (s: GoalSummaryDTO['status']) =>
    visible
      .filter((g) => g.status === s)
      .sort((a, b) => (b.activatedOn ?? '').localeCompare(a.activatedOn ?? '') || b.updatedAt.localeCompare(a.updatedAt));
  return by('active')[0] ?? by('draft')[0] ?? by('achieved')[0];
}
