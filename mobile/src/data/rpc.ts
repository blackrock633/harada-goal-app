/**
 * Implementations of the mutation interfaces (mutations.ts) over Supabase RPCs (API_CONTRACTS §7).
 *
 * Every mutation: (1) safeParse with the matching shared Zod schema, failing with a VALIDATION Result
 * and NO network call; (2) `supabase.rpc(name, { p_input: parsed.data })`; (3) error -> toAppError(error,
 * status), throw -> thrownToAppError(); (4) success -> map the returned snake_case row to the promised
 * DTO and invalidate the affected queries.
 *
 * Action DTOs need data the RPC row does not carry (recent routine checks, today's focus), so those
 * mutations make up to two follow-up reads after the write (see `hydrateAction`).
 */
import type { QueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActionDTO, GoalFieldsDTO } from '@shared/application/dto';
import { checksFrom, actionDTO, goalFieldsDTO, outcomeFieldsDTO, reflectionDTO } from '@shared/application/read-model';
import {
  actionFromRow,
  goalFromRow,
  outcomeFromRow,
  reflectionFromRow,
  SELECT_COLUMNS,
  type ActionRow,
  type GoalRow,
  type OutcomeRow,
  type ReflectionRow,
} from '@shared/application/rows';
import type { AppError, Result } from '@shared/application/result';
import {
  actionIdSchema,
  addActionSchema,
  addOutcomeSchema,
  addReflectionSchema,
  createGoalSchema,
  type CreateGoalInput,
  focusSchema,
  goalIdSchema,
  routineCheckSchema,
  updateActionSchema,
  updateGoalSchema,
  updateOutcomeSchema,
  updateReflectionSchema,
} from '@shared/application/schemas';
import { instantiateTemplate, TEMPLATES } from '@shared/domain/templates';

import { newClientId } from './errors';
import type { templatePayload } from './premium';
import { keys } from './query-client';
import type { ExecutionMutations, FocusMutations, GoalMutations, MatrixMutations, ReviewMutations } from './mutations';
import type { Filter } from './reads';
import { thrownToAppError, toAppError } from './rpc-errors';

export interface RpcDeps {
  supabase: SupabaseClient;
  queryClient: Pick<QueryClient, 'invalidateQueries'>;
  /** The user's local date (profile time zone) at call time. */
  today: () => string | Promise<string>;
}

export type AllMutations = GoalMutations &
  MatrixMutations &
  ExecutionMutations &
  FocusMutations &
  ReviewMutations & {
    /** Creates a draft goal with the template's outcomes and actions in one atomic RPC. */
    createGoalFromTemplate: (templateId: string, clientId: string) => Promise<Result<GoalFieldsDTO>>;
    /** Same, for a template from the server catalogue (premium.ts templatePayload). */
    createGoalFromContent: (payload: TemplatePayload) => Promise<Result<GoalFieldsDTO>>;
  };

export type TemplatePayload = ReturnType<typeof templatePayload>;

const fail = (error: AppError): { ok: false; error: AppError } => ({ ok: false, error });

/**
 * Structural stand-in for a Zod schema. The shared schemas resolve `zod` from the repo root while
 * mobile has its own copy, so their nominal types differ; only this shape is used.
 */
interface Schema<P> {
  safeParse(input: unknown): { success: true; data: P } | { success: false; error: { issues: readonly Issue[] } };
}
interface Issue {
  path: readonly PropertyKey[];
  message: string;
}

function validationFailure(error: { issues: readonly Issue[] }): { ok: false; error: AppError } {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_';
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fail({ code: 'VALIDATION', message: 'Please check the highlighted fields', fieldErrors });
}

export function createMutations(deps: RpcDeps): AllMutations {
  const { supabase, queryClient } = deps;

  const invalidateGoal = (goalId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.todayRoot }),
      queryClient.invalidateQueries({ queryKey: keys.goals }),
      queryClient.invalidateQueries({ queryKey: keys.goalDetail(goalId) }),
      queryClient.invalidateQueries({ queryKey: keys.review(goalId) }),
    ]).then(() => undefined);

  /** Calls the RPC. Returns the row, or the mapped error. Never throws. */
  async function callRpc<Row>(name: string, pInput: unknown): Promise<{ ok: true; row: Row } | { ok: false; error: AppError }> {
    try {
      const { data, error, status } = await supabase.rpc(name, { p_input: pInput });
      if (error) return fail(toAppError(error, status));
      return { ok: true, row: data as Row };
    } catch {
      return fail(thrownToAppError());
    }
  }

  /** Reads after a successful write. Never throws; `null` means "could not read". */
  async function readRows<T>(table: keyof typeof SELECT_COLUMNS, refine: (q: Filter) => Filter): Promise<T[] | null> {
    try {
      const res = await refine(supabase.from(table).select(SELECT_COLUMNS[table]) as unknown as Filter);
      return res.error ? null : ((res.data ?? []) as T[]);
    } catch {
      return null;
    }
  }

  /**
   * ActionDTO for an action row returned by an RPC: its checks over the read-model window (routines
   * only) and whether it is in today's focus. `checkOverride` makes the checked date explicit for
   * check/uncheck. If a follow-up read fails after the write succeeded, the DTO degrades to what is
   * known (the override only; not focused) and the invalidation below makes screens refetch the truth.
   */
  async function hydrateAction(
    row: ActionRow,
    checkOverride?: { date: string; present: boolean },
    focusOverride?: boolean,
  ): Promise<ActionDTO> {
    const today = await deps.today();
    const action = actionFromRow(row);
    const [checkRows, focusRows] = await Promise.all([
      action.kind === 'routine'
        ? readRows<{ date: string }>('routine_checks', (q) => q.eq('action_id', row.id).gte('date', checksFrom(today)))
        : Promise.resolve([]),
      readRows<{ action_id: string }>('daily_focus', (q) => q.eq('action_id', row.id).eq('date', today)),
    ]);
    let checks = (checkRows ?? []).map((c) => c.date);
    if (checkOverride) {
      checks = checks.filter((d) => d !== checkOverride.date);
      if (checkOverride.present) checks.push(checkOverride.date);
    }
    return actionDTO(action, checks, today, focusOverride ?? (focusRows ?? []).length > 0);
  }

  /** Validate -> rpc -> map -> invalidate. */
  async function run<P, Row, Out>(
    name: string,
    schema: Schema<P>,
    input: unknown,
    goalIdOf: (row: Row, parsed: P) => string,
    map: (row: Row, parsed: P) => Out | Promise<Out>,
  ): Promise<Result<Out>> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const res = await callRpc<Row>(name, parsed.data);
    if (!res.ok) return res;
    const data = await map(res.row, parsed.data);
    await invalidateGoal(goalIdOf(res.row, parsed.data));
    return { ok: true, data };
  }

  const goalDto = (row: GoalRow) => goalFieldsDTO(goalFromRow(row));
  const outcomeDto = (row: OutcomeRow) => outcomeFieldsDTO(outcomeFromRow(row));
  const goalOfGoalRow = (row: GoalRow) => row.id;
  const goalOfAction = (row: ActionRow) => row.goal_id;

  const transition = (name: string) => (input: { goalId: string }) =>
    run(name, goalIdSchema, input, goalOfGoalRow, goalDto);
  const actionTransition = (name: string) => (input: { actionId: string }) =>
    run(name, actionIdSchema, input, goalOfAction, (row) => hydrateAction(row));

  /**
   * add_to_today returns the daily_focus row and remove_from_today returns void, but the interface
   * promises an ActionDTO. The action row is read BEFORE the write: if that read fails nothing has
   * been written, so UNAVAILABLE ("nothing was saved") is true. After a successful write the DTO is
   * built from that row plus the known new focus state, so a failed refresh can never be reported
   * as an unsaved change (errorMessage() words every UNAVAILABLE as "Nothing was saved").
   */
  async function focusMutation(name: 'add_to_today' | 'remove_from_today', input: unknown): Promise<Result<ActionDTO>> {
    const parsed = focusSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const rows = await readRows<ActionRow>('actions', (q) => q.eq('id', parsed.data.actionId).limit(1));
    if (rows === null) return fail({ code: 'UNAVAILABLE', message: "Couldn't reach the server." });
    const row = rows[0];
    if (!row) return fail({ code: 'NOT_FOUND', message: "That item doesn't exist or isn't yours." });
    const res = await callRpc<unknown>(name, parsed.data);
    if (!res.ok) return res;
    const today = await deps.today();
    const forToday = (parsed.data.date ?? today) === today;
    const data = await hydrateAction(row, undefined, forToday ? name === 'add_to_today' : undefined);
    await invalidateGoal(row.goal_id);
    return { ok: true, data };
  }

  return {
    createGoal: (input) =>
      run('create_goal', createGoalSchema, input, goalOfGoalRow, goalDto),
    updateGoal: (input) =>
      run('update_goal', updateGoalSchema, input, goalOfGoalRow, goalDto),
    activateGoal: transition('activate_goal'),
    restoreGoal: transition('restore_goal'),
    markGoalAchieved: transition('mark_goal_achieved'),

    addOutcome: (input) =>
      run('add_outcome', addOutcomeSchema, input, (r: OutcomeRow) => r.goal_id, outcomeDto),
    updateOutcome: (input) =>
      run('update_outcome', updateOutcomeSchema, input, (r: OutcomeRow) => r.goal_id, outcomeDto),
    addAction: (input) =>
      run('add_action', addActionSchema, input, goalOfAction, (row) => hydrateAction(row)),
    updateAction: (input) =>
      run('update_action', updateActionSchema, input, goalOfAction, (row) => hydrateAction(row)),

    completeAction: actionTransition('complete_action'),
    reopenAction: actionTransition('reopen_action'),
    checkRoutine: (input) =>
      run('check_routine', routineCheckSchema, input, goalOfAction, (row, p) =>
        hydrateAction(row, { date: p.date, present: true }),
      ),
    uncheckRoutine: (input) =>
      run('uncheck_routine', routineCheckSchema, input, goalOfAction, (row, p) =>
        hydrateAction(row, { date: p.date, present: false }),
      ),

    addToToday: (input) => focusMutation('add_to_today', input),
    removeFromToday: (input) => focusMutation('remove_from_today', input),

    addReflection: (input) =>
      run(
        'add_reflection',
        addReflectionSchema,
        input,
        (r: ReflectionRow) => r.goal_id,
        (row: ReflectionRow) => reflectionDTO(reflectionFromRow(row)),
      ),
    updateReflection: (input) =>
      run(
        'update_reflection',
        updateReflectionSchema,
        input,
        (r: ReflectionRow) => r.goal_id,
        (row: ReflectionRow) => reflectionDTO(reflectionFromRow(row)),
      ),

    createGoalFromContent: (payload) => createFromContent(payload),
    createGoalFromTemplate: (templateId, clientId) => createFromTemplate(templateId, clientId),
  };

  /** The core goal fields are validated like any create; the nested plan is checked by create_goal. */
  async function createFromContent(payload: TemplatePayload): Promise<Result<GoalFieldsDTO>> {
    const { templateId, outcomes, ...fields } = payload;
    const core = createGoalSchema.safeParse(fields);
    if (!core.success) return validationFailure(core.error);
    const res = await callRpc<GoalRow>('create_goal', { ...core.data, templateId, outcomes });
    if (!res.ok) return res;
    await invalidateGoal(res.row.id);
    return { ok: true, data: goalDto(res.row) };
  }

  async function createFromTemplate(templateId: string, clientId: string): Promise<Result<GoalFieldsDTO>> {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      return fail({ code: 'VALIDATION', message: 'Unknown template', fieldErrors: { templateId: ['Unknown template'] } });
    }
    const core = createGoalSchema.safeParse({
      id: clientId,
      title: template.goalTitle,
      vision: template.vision,
      purpose: template.purpose,
    });
    if (!core.success) return validationFailure(core.error);
    const payload = buildTemplatePayload(templateId, core.data);
    const res = await callRpc<GoalRow>('create_goal', payload);
    if (!res.ok) return res;
    await invalidateGoal(res.row.id);
    return { ok: true, data: goalDto(res.row) };
  }
}

/**
 * create_goal input for a template: the validated core goal fields plus `templateId` and the nested
 * plan. The goal id is the caller's client id (a replay returns the existing goal); every nested
 * outcome and action gets its own fresh uuid. Positions come from the domain instantiation.
 */
export function buildTemplatePayload(templateId: string, core: CreateGoalInput) {
  const { outcomes, actions } = instantiateTemplate(templateId, {
    ownerId: 'device',
    ids: newClientId,
    today: '2000-01-01',
    now: new Date(),
  });
  return {
    ...core,
    templateId,
    outcomes: outcomes.map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      ...(o.measure ? { measure: o.measure } : {}),
      position: o.position,
      actions: actions
        .filter((a) => a.outcomeId === o.id)
        .map((a) => ({
          id: a.id,
          title: a.title,
          kind: a.kind,
          position: a.position,
          ...(a.schedule ? { schedule: a.schedule } : {}),
        })),
    })),
  };
}
