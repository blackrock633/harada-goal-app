import { addActionSchema, addOutcomeSchema, createGoalSchema } from '@shared/application/schemas';
import { TEMPLATES } from '@shared/domain/templates';
import { actionDTO, goalFieldsDTO, outcomeFieldsDTO, reflectionDTO } from '@shared/application/read-model';
import { actionFromRow, goalFromRow, outcomeFromRow, reflectionFromRow } from '@shared/application/rows';

import { createFakeSupabase, type RpcReply } from '../test-support/fake-supabase';
import { actionRow, checkRow, database, focusRow, goalRow, ID, outcomeRow, reflectionRow, routineRow, TODAY, uuid } from '../test-support/fixtures';
import { createMutations } from '../rpc';
import { templatePayload, type TemplateContent } from '../premium';

const newMutations = (replies: Record<string, RpcReply> = {}, tables: Record<string, Record<string, unknown>[]> = {}) => {
  const fake = createFakeSupabase({ ...database(), ...tables }, replies);
  const invalidateQueries = jest.fn(async () => undefined);
  const m = createMutations({ supabase: fake.client, queryClient: { invalidateQueries }, today: () => TODAY });
  const invalidated = () => invalidateQueries.mock.calls.map((c) => (c as unknown as [{ queryKey: unknown[] }])[0].queryKey);
  return { ...fake, m, invalidateQueries, invalidated };
};

const goalKeys = (id: string) => [['today'], ['goals'], ['goal', id], ['review', id]];
const row = (data: unknown): RpcReply => ({ data, error: null, status: 200 });

interface Case {
  method: string;
  rpc: string;
  input: Record<string, unknown>;
  parsed: Record<string, unknown>;
  badInput: Record<string, unknown>;
  reply: unknown;
  goalId: string;
  expectData: (reply: never) => unknown;
}

const goalReply = goalRow({ id: ID.goalActive });
const outcomeReply = outcomeRow();
const taskReply = actionRow();
const routineReply = routineRow();
const reflectionReply = reflectionRow();
const dto = {
  goal: (r: never) => goalFieldsDTO(goalFromRow(r)),
  outcome: (r: never) => outcomeFieldsDTO(outcomeFromRow(r)),
  reflection: (r: never) => reflectionDTO(reflectionFromRow(r)),
  // fixtures: the routine has checks for today and yesterday, and is focused today
  routine: (r: never) => actionDTO(actionFromRow(r), [TODAY, '2026-10-19'], TODAY, true),
  task: (r: never) => actionDTO(actionFromRow(r), [], TODAY, false),
};

const cases: Case[] = [
  { method: 'createGoal', rpc: 'create_goal', input: { id: ID.goalActive, title: '  Hello  ' }, parsed: { id: ID.goalActive, title: 'Hello' }, badInput: { title: '' }, reply: goalReply, goalId: ID.goalActive, expectData: dto.goal },
  { method: 'updateGoal', rpc: 'update_goal', input: { goalId: ID.goalActive, title: 'New' }, parsed: { goalId: ID.goalActive, title: 'New' }, badInput: { goalId: 'nope' }, reply: goalReply, goalId: ID.goalActive, expectData: dto.goal },
  { method: 'activateGoal', rpc: 'activate_goal', input: { goalId: ID.goalActive }, parsed: { goalId: ID.goalActive }, badInput: { goalId: 'x' }, reply: goalReply, goalId: ID.goalActive, expectData: dto.goal },
  { method: 'restoreGoal', rpc: 'restore_goal', input: { goalId: ID.goalActive }, parsed: { goalId: ID.goalActive }, badInput: { goalId: 'x' }, reply: goalReply, goalId: ID.goalActive, expectData: dto.goal },
  { method: 'addOutcome', rpc: 'add_outcome', input: { goalId: ID.goalActive, title: 'Area', position: 3 }, parsed: { goalId: ID.goalActive, title: 'Area', position: 3 }, badInput: { goalId: ID.goalActive, title: 'x', position: 9 }, reply: outcomeReply, goalId: ID.goalActive, expectData: dto.outcome },
  { method: 'updateOutcome', rpc: 'update_outcome', input: { outcomeId: ID.outcome, measure: null }, parsed: { outcomeId: ID.outcome, measure: null }, badInput: { outcomeId: ID.outcome, title: '' }, reply: outcomeReply, goalId: ID.goalActive, expectData: dto.outcome },
  { method: 'addAction', rpc: 'add_action', input: { outcomeId: ID.outcome, title: 'Do', kind: 'task' }, parsed: { outcomeId: ID.outcome, title: 'Do', kind: 'task' }, badInput: { outcomeId: ID.outcome, title: 'Do', kind: 'chore' }, reply: taskReply, goalId: ID.goalActive, expectData: dto.task },
  { method: 'updateAction', rpc: 'update_action', input: { actionId: ID.routine, title: 'Run more' }, parsed: { actionId: ID.routine, title: 'Run more' }, badInput: { actionId: ID.routine, title: '' }, reply: routineReply, goalId: ID.goalActive, expectData: dto.routine },
  { method: 'completeAction', rpc: 'complete_action', input: { actionId: ID.task }, parsed: { actionId: ID.task }, badInput: { actionId: '' }, reply: taskReply, goalId: ID.goalActive, expectData: dto.task },
  { method: 'reopenAction', rpc: 'reopen_action', input: { actionId: ID.task }, parsed: { actionId: ID.task }, badInput: {}, reply: taskReply, goalId: ID.goalActive, expectData: dto.task },
  { method: 'checkRoutine', rpc: 'check_routine', input: { actionId: ID.routine, date: TODAY }, parsed: { actionId: ID.routine, date: TODAY }, badInput: { actionId: ID.routine, date: '10/20' }, reply: routineReply, goalId: ID.goalActive, expectData: dto.routine },
  { method: 'uncheckRoutine', rpc: 'uncheck_routine', input: { actionId: ID.routine, date: '2026-10-19' }, parsed: { actionId: ID.routine, date: '2026-10-19' }, badInput: { actionId: ID.routine }, reply: routineReply, goalId: ID.goalActive, expectData: (r) => actionDTO(actionFromRow(r), [TODAY], TODAY, true) },
  { method: 'addReflection', rpc: 'add_reflection', input: { goalId: ID.goalActive, date: '2026-10-19', kind: 'daily', wentWell: ' good ' }, parsed: { goalId: ID.goalActive, date: '2026-10-19', kind: 'daily', wentWell: 'good' }, badInput: { goalId: ID.goalActive, date: '2026-10-19', kind: 'yearly' }, reply: reflectionReply, goalId: ID.goalActive, expectData: dto.reflection },
  { method: 'updateReflection', rpc: 'update_reflection', input: { reflectionId: ID.goalActive, expectedUpdatedAt: '2026-10-19T09:00:00.000Z', wentWell: ' better ', answers: { learned: 'x' } }, parsed: { reflectionId: ID.goalActive, expectedUpdatedAt: '2026-10-19T09:00:00.000Z', wentWell: 'better', answers: { learned: 'x' } }, badInput: { reflectionId: ID.goalActive, answers: { mood: 'x' } }, reply: reflectionReply, goalId: ID.goalActive, expectData: dto.reflection },
];

describe.each(cases)('$method', (c) => {
  const call = (m: ReturnType<typeof newMutations>['m'], input: unknown) =>
    (m as unknown as Record<string, (i: unknown) => Promise<{ ok: boolean; data?: unknown; error?: { code: string; fieldErrors?: unknown } }>>)[c.method]!(input);

  it('sends the exact rpc name and the schema output as p_input, then maps the row to the DTO', async () => {
    const t = newMutations({ [c.rpc]: row(c.reply) });
    const res = await call(t.m, c.input);
    expect(t.rpc).toHaveBeenCalledTimes(1);
    expect(t.rpc).toHaveBeenCalledWith(c.rpc, { p_input: c.parsed });
    expect(res).toEqual({ ok: true, data: c.expectData(c.reply as never) });
  });

  it('invalidates today, goals, the goal detail and its review on success', async () => {
    const t = newMutations({ [c.rpc]: row(c.reply) });
    await call(t.m, c.input);
    expect(t.invalidated()).toEqual(goalKeys(c.goalId));
  });

  it('fails validation locally with field errors and makes no network call', async () => {
    const t = newMutations({ [c.rpc]: row(c.reply) });
    const res = await call(t.m, c.badInput);
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('VALIDATION');
    expect(Object.keys(res.error?.fieldErrors as object).length).toBeGreaterThan(0);
    expect(t.rpc).not.toHaveBeenCalled();
    expect(t.queries).toHaveLength(0);
    expect(t.invalidateQueries).not.toHaveBeenCalled();
  });

  it('maps rpc errors through toAppError and does not invalidate', async () => {
    const t = newMutations({ [c.rpc]: { error: { code: 'HG409', message: 'Changed elsewhere', hint: '' }, status: 409 } });
    expect(await call(t.m, c.input)).toEqual({ ok: false, error: { code: 'CONFLICT', message: 'Changed elsewhere' } });
    expect(t.invalidateQueries).not.toHaveBeenCalled();
  });

  it('maps a thrown request failure to UNAVAILABLE', async () => {
    const t = newMutations({ [c.rpc]: { throws: true } });
    expect(await call(t.m, c.input)).toEqual({ ok: false, error: { code: 'UNAVAILABLE', message: "Couldn't reach the server." } });
  });

  it('maps a network failure (status 0) to UNAVAILABLE', async () => {
    const t = newMutations({ [c.rpc]: { error: { message: 'Failed to fetch' }, status: 0 } });
    const res = await call(t.m, c.input);
    expect(res.error?.code).toBe('UNAVAILABLE');
  });
});

describe('error mapping details', () => {
  it('turns an HG400 hint into a field error and HG429 into LIMIT_REACHED', async () => {
    const a = newMutations({ add_outcome: { error: { code: 'HG400', message: 'Required', hint: 'title' }, status: 400 } });
    expect(await a.m.addOutcome({ goalId: ID.goalActive, title: 'x' })).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: 'Required', fieldErrors: { title: ['Required'] } },
    });
    const b = newMutations({ add_to_today: { error: { code: 'HG429', message: 'Max 5 picks', hint: '' }, status: 400 } });
    expect(await b.m.addToToday({ actionId: ID.task })).toEqual({ ok: false, error: { code: 'LIMIT_REACHED', message: 'Max 5 picks' } });
    expect(b.invalidateQueries).not.toHaveBeenCalled();
  });
});

describe('check / uncheck routine -> checkedToday', () => {
  it('checkRoutine(today) includes today even when the read-back does not have it yet', async () => {
    const t = newMutations({ check_routine: row(routineRow()) }, { routine_checks: [checkRow(ID.routine, '2026-10-18')], daily_focus: [] });
    const res = await t.m.checkRoutine({ actionId: ID.routine, date: TODAY });
    expect(res.ok && res.data.checkedToday).toBe(true);
    expect(res.ok && res.data.recentChecks).toEqual(['2026-10-18', TODAY]);
    expect(res.ok && res.data.focusedToday).toBe(false);
  });

  it('uncheckRoutine(today) excludes today even if the read-back still has it', async () => {
    const t = newMutations({ uncheck_routine: row(routineRow()) }, { routine_checks: [checkRow(ID.routine, TODAY), checkRow(ID.routine, '2026-10-19')] });
    const res = await t.m.uncheckRoutine({ actionId: ID.routine, date: TODAY });
    expect(res.ok && res.data.checkedToday).toBe(false);
    expect(res.ok && res.data.recentChecks).toEqual(['2026-10-19']);
  });

  it('checking a past date does not change checkedToday', async () => {
    const t = newMutations({ check_routine: row(routineRow()) }, { routine_checks: [] });
    const res = await t.m.checkRoutine({ actionId: ID.routine, date: '2026-10-19' });
    expect(res.ok && res.data.checkedToday).toBe(false);
    expect(res.ok && res.data.recentChecks).toEqual(['2026-10-19']);
  });

  it('reads only this action\'s checks inside the read-model window', async () => {
    const t = newMutations({ check_routine: row(routineRow()) });
    await t.m.checkRoutine({ actionId: ID.routine, date: TODAY });
    const q = t.queries.find((x) => x.table === 'routine_checks')!;
    expect(q.filters).toEqual([`eq action_id ${ID.routine}`, 'gte date 2026-09-16']);
  });

  it('degrades to the known data (still ok) when the follow-up reads fail after the write', async () => {
    const t = newMutations({ check_routine: row(routineRow()) });
    t.failTable('routine_checks', { message: 'down' });
    t.failTable('daily_focus', { message: 'down' });
    const res = await t.m.checkRoutine({ actionId: ID.routine, date: TODAY });
    expect(res.ok && res.data.checkedToday).toBe(true);
    expect(t.invalidated()).toEqual(goalKeys(ID.goalActive));
  });

  it('tasks make no routine_checks read', async () => {
    const t = newMutations({ complete_action: row(actionRow({ completed_at: '2026-10-20T10:00:00+00:00' })) });
    const res = await t.m.completeAction({ actionId: ID.task });
    expect(t.queries.map((q) => q.table)).toEqual(['daily_focus']);
    expect(res.ok && res.data.progress).toBeDefined();
  });
});

describe('updateGoal purpose patch (data-loss regression, backend c215716)', () => {
  it('sends only the purpose quadrant that was edited, never blanks for the others', async () => {
    const t = newMutations({ update_goal: row(goalRow()) });
    await t.m.updateGoal({ goalId: ID.goalActive, purpose: { othersTangible: 'A stronger team' } });
    expect(t.rpc).toHaveBeenCalledWith('update_goal', {
      p_input: { goalId: ID.goalActive, purpose: { othersTangible: 'A stronger team' } },
    });
  });
});

describe('focus mutations', () => {
  it('addToToday: rpc(add_to_today, p_input) then returns the reloaded ActionDTO with focusedToday', async () => {
    const t = newMutations({ add_to_today: row(focusRow(ID.task)) }, { daily_focus: [focusRow(ID.task)] });
    const res = await t.m.addToToday({ actionId: ID.task });
    expect(t.rpc).toHaveBeenCalledWith('add_to_today', { p_input: { actionId: ID.task } });
    expect(res.ok && res.data.id).toBe(ID.task);
    expect(res.ok && res.data.focusedToday).toBe(true);
    expect(t.invalidated()).toEqual(goalKeys(ID.goalActive));
  });

  it('removeFromToday: void rpc result; the DTO is rebuilt from the database and is not focused', async () => {
    const t = newMutations({ remove_from_today: row(null) }, { daily_focus: [] });
    const res = await t.m.removeFromToday({ actionId: ID.routine, date: TODAY });
    expect(t.rpc).toHaveBeenCalledWith('remove_from_today', { p_input: { actionId: ID.routine, date: TODAY } });
    expect(res.ok && res.data.focusedToday).toBe(false);
    expect(res.ok && res.data.id).toBe(ID.routine);
  });

  it('a date other than today does not mark the action focused for today', async () => {
    const tomorrow = '2026-10-21';
    const t = newMutations({ add_to_today: row(focusRow(ID.task, tomorrow)) }, { daily_focus: [focusRow(ID.task, tomorrow)] });
    const res = await t.m.addToToday({ actionId: ID.task, date: tomorrow });
    expect(res.ok && res.data.focusedToday).toBe(false);
  });

  it('rejects a bad date locally', async () => {
    const t = newMutations();
    const res = await t.m.addToToday({ actionId: ID.task, date: 'tomorrow' });
    expect(res.ok).toBe(false);
    expect(t.rpc).not.toHaveBeenCalled();
  });

  it('never writes when the action cannot be read first (honest "nothing was saved")', async () => {
    const gone = newMutations({ add_to_today: row(focusRow(uuid(77))) }, { actions: [] });
    expect(await gone.m.addToToday({ actionId: uuid(77) })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(gone.rpc).not.toHaveBeenCalled();
    const down = newMutations({ add_to_today: row(focusRow(ID.task)) });
    down.failTable('actions', { message: 'down' });
    expect(await down.m.addToToday({ actionId: ID.task })).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } });
    expect(down.rpc).not.toHaveBeenCalled();
  });

  it('a failed refresh after a successful write still reports the save, with the right focus state', async () => {
    const added = newMutations({ add_to_today: row(focusRow(ID.task)) });
    added.failTable('daily_focus', { message: 'down' });
    const a = await added.m.addToToday({ actionId: ID.task });
    expect(a.ok && a.data.focusedToday).toBe(true);
    const removed = newMutations({ remove_from_today: row(null) }, { daily_focus: [focusRow(ID.task)] });
    removed.failTable('daily_focus', { message: 'down' });
    const r = await removed.m.removeFromToday({ actionId: ID.task });
    expect(r.ok && r.data.focusedToday).toBe(false);
  });
});

describe('createGoalFromTemplate', () => {
  const clientId = uuid(700);

  it.each(TEMPLATES.map((t) => t.id))('template %s: create_goal with templateId, client ids everywhere, schema-valid nested plan', async (templateId) => {
    const template = TEMPLATES.find((t) => t.id === templateId)!;
    const t = newMutations({ create_goal: row(goalRow({ id: clientId, title: template.goalTitle, status: 'draft' })) });
    const res = await t.m.createGoalFromTemplate(templateId, clientId);

    expect(res).toEqual({ ok: true, data: goalFieldsDTO(goalFromRow(goalRow({ id: clientId, title: template.goalTitle, status: 'draft' }) as never)) });
    expect(t.rpc).toHaveBeenCalledTimes(1);
    const [name, { p_input }] = t.rpc.mock.calls[0] as unknown as [string, { p_input: Record<string, unknown> & { outcomes: { id: string; position: number; actions: { id: string }[] }[] } }];
    expect(name).toBe('create_goal');
    expect(p_input).toMatchObject({ id: clientId, templateId, title: template.goalTitle, vision: template.vision });
    expect(createGoalSchema.safeParse({ ...p_input, outcomes: undefined, templateId: undefined }).success).toBe(true);

    expect(p_input.outcomes.map((o) => o.position)).toEqual(template.outcomes.map((_, i) => i));
    expect(p_input.outcomes).toHaveLength(template.outcomes.length);
    const ids = [clientId, ...p_input.outcomes.flatMap((o) => [o.id, ...o.actions.map((a) => a.id)])];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
    p_input.outcomes.forEach((o, i) => {
      const { actions, ...outcome } = o as Record<string, unknown> & { actions: Record<string, unknown>[] };
      expect(addOutcomeSchema.safeParse({ ...outcome, goalId: clientId }).success).toBe(true);
      expect(actions.map((a) => a.title)).toEqual(template.outcomes[i]!.actions.map((a) => a.title));
      for (const a of actions) expect(addActionSchema.safeParse({ ...a, outcomeId: o.id }).success).toBe(true);
    });
    expect(t.invalidated()).toEqual(goalKeys(clientId));
  });

  it('is idempotent on the goal client id and maps rpc errors', async () => {
    const t = newMutations({ create_goal: { error: { code: 'HG429', message: 'You already have 8 key areas.', hint: '' }, status: 400 } });
    expect(await t.m.createGoalFromTemplate('marathon', clientId)).toEqual({ ok: false, error: { code: 'LIMIT_REACHED', message: 'You already have 8 key areas.' } });
    await t.m.createGoalFromTemplate('marathon', clientId);
    const ids = t.rpc.mock.calls.map((c) => (c[1] as { p_input: { id: string } }).p_input.id);
    expect(ids).toEqual([clientId, clientId]);
    expect(t.invalidateQueries).not.toHaveBeenCalled();
  });

  it('rejects an unknown template or a malformed client id without a network call', async () => {
    const t = newMutations();
    expect(await t.m.createGoalFromTemplate('nope', clientId)).toMatchObject({ ok: false, error: { code: 'VALIDATION', fieldErrors: { templateId: expect.any(Array) } } });
    expect(await t.m.createGoalFromTemplate('marathon', 'not-a-uuid')).toMatchObject({ ok: false, error: { code: 'VALIDATION', fieldErrors: { id: expect.any(Array) } } });
    expect(t.rpc).not.toHaveBeenCalled();
  });
});

describe('createGoalFromContent (server catalogue)', () => {
  const clientId = uuid(701);
  const t0 = TEMPLATES[0]!;
  const content = { ...t0, tier: 'premium' } as unknown as TemplateContent;

  it('sends create_goal with the template id, the client id and the nested plan', async () => {
    const t = newMutations({ create_goal: row(goalRow({ id: clientId, title: t0.goalTitle, status: 'draft' })) });
    const res = await t.m.createGoalFromContent(templatePayload(content, clientId));
    expect(res.ok).toBe(true);
    const [name, { p_input }] = t.rpc.mock.calls[0] as unknown as [string, { p_input: { id: string; templateId: string; outcomes: unknown[] } }];
    expect(name).toBe('create_goal');
    expect(p_input).toMatchObject({ id: clientId, templateId: t0.id, title: t0.goalTitle });
    expect(p_input.outcomes).toHaveLength(Math.min(8, t0.outcomes.length));
    expect(t.invalidated()).toEqual(goalKeys(clientId));
  });

  it('validates the goal fields locally', async () => {
    const t = newMutations();
    const res = await t.m.createGoalFromContent(templatePayload({ ...content, goalTitle: '' }, clientId));
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(t.rpc).not.toHaveBeenCalled();
  });
});
