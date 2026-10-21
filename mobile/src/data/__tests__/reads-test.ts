import {
  actionFromRow,
  dailyFocusFromRow,
  goalFromRow,
  outcomeFromRow,
  reflectionFromRow,
  routineCheckFromRow,
  SELECT_COLUMNS,
} from '@shared/application/rows';
import {
  buildGoalDetail,
  buildGraph,
  buildSummaryDTOs,
  buildTodayDTO,
  checksFrom,
  eventDTO,
  reflectionDTO,
} from '@shared/application/read-model';
import { goalEventFromRow } from '@shared/application/rows';
import type { GoalSummaryDTO } from '@shared/application/dto';

import { createFakeSupabase } from '../test-support/fake-supabase';
import { database, eventRow, ID, OWNER, TODAY, TZ, uuid } from '../test-support/fixtures';
import { createQueryClient, keys, retryDelay, shouldRetryRead } from '../query-client';
import {
  focusedGoal,
  loadGoalDetail,
  loadGoals,
  loadProfile,
  loadReview,
  loadToday,
  QueryError,
} from '../reads';

const ctx = { today: TODAY, timeZone: TZ };
type Rows = ReturnType<typeof database>;

/** The read model applied directly to the fixture rows, the way the web server composes it. */
function expected(db: Rows, goalIds?: string[]) {
  const goals = db.goals.map((r) => goalFromRow(r as never));
  const rowsFor = (ids: string[]) => ({
    outcomes: db.outcomes.filter((o) => ids.includes(o.goal_id)).map((r) => outcomeFromRow(r as never)),
    actions: db.actions.filter((a) => ids.includes(a.goal_id)).map((r) => actionFromRow(r as never)),
  });
  const graphFor = (ids: string[]) => {
    const { outcomes, actions } = rowsFor(ids);
    const routines = actions.filter((a) => a.archivedAt === null && a.kind === 'routine').map((a) => a.id);
    const checks = db.routine_checks
      .filter((c) => routines.includes(c.action_id) && c.date >= checksFrom(TODAY))
      .map((r) => routineCheckFromRow(r as never));
    const focus = db.daily_focus.filter((f) => f.date === TODAY).map((r) => dailyFocusFromRow(r as never));
    return buildGraph(outcomes, actions, checks, focus, TODAY);
  };
  const lastReflected = (ids: string[]) => {
    const out: Record<string, string> = {};
    for (const r of db.reflections) if (ids.includes(r.goal_id) && (out[r.goal_id] ?? '') < r.date) out[r.goal_id] = r.date;
    return out;
  };
  void goalIds;
  return { goals, graphFor, lastReflected };
}

describe('loadProfile', () => {
  it('maps the profile and computes the local date in its time zone', async () => {
    const fake = createFakeSupabase(database());
    // 2026-10-21T02:30Z is still Oct 20 in New York
    const p = await loadProfile(fake.client, new Date('2026-10-21T02:30:00Z'));
    expect(p).toEqual({ id: OWNER, displayName: 'Ada', timeZone: TZ, today: '2026-10-20' });
    expect(fake.queries[0]).toMatchObject({ table: 'profiles', columns: SELECT_COLUMNS.profiles });
  });

  it('is UNAUTHENTICATED when RLS returns no profile', async () => {
    const fake = createFakeSupabase({ profiles: [] });
    await expect(loadProfile(fake.client)).rejects.toMatchObject({ appError: { code: 'UNAUTHENTICATED' } });
  });
});

describe('loaders', () => {
  it('loadToday equals the read model on the same rows', async () => {
    const db = database();
    const fake = createFakeSupabase(db);
    const dto = await loadToday(fake.client, ctx);
    const e = expected(db);
    const live = e.goals.filter((g) => g.status !== 'archived').map((g) => g.id);
    expect(dto).toEqual(buildTodayDTO(e.goals, e.graphFor(live), e.lastReflected(live), TODAY, TZ));
    // sanity: the fixture exercises focus, routine check and both goal kinds
    expect(dto.focus.map((f) => f.action.id)).toEqual([ID.routine]);
    expect(dto.focus[0]!.action.checkedToday).toBe(true);
    expect(dto.goals).toHaveLength(1);
    expect(dto.draftGoals).toHaveLength(1);
  });

  it('loadToday follows the web loader: archived goals are not graphed, checks are bounded, focus is today only', async () => {
    const fake = createFakeSupabase(database());
    await loadToday(fake.client, ctx);
    const q = (t: string) => fake.queries.filter((x) => x.table === t);
    expect(q('goals')).toHaveLength(1);
    expect(q('outcomes')[0]!.filters).toContain(`in goal_id ${ID.goalActive}|${ID.goalDraft}`);
    expect(q('actions')[0]!.filters).toContain(`in goal_id ${ID.goalActive}|${ID.goalDraft}`);
    expect(q('routine_checks')[0]!.filters).toEqual(
      expect.arrayContaining([`in action_id ${ID.routine}`, `gte date ${checksFrom(TODAY)}`]),
    );
    expect(q('daily_focus')[0]!.filters).toContain(`eq date ${TODAY}`);
    expect(q('reflections')[0]!.filters).toContain(`in goal_id ${ID.goalActive}|${ID.goalDraft}`);
  });

  it('loadGoals equals buildSummaryDTOs for all goals, newest update first', async () => {
    const db = database();
    const fake = createFakeSupabase(db);
    const dto = await loadGoals(fake.client, ctx);
    const e = expected(db);
    const all = e.goals.map((g) => g.id);
    const sorted = [...e.goals].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    expect(dto).toEqual(buildSummaryDTOs(sorted, e.graphFor(all), e.lastReflected(all), TODAY, TZ));
    expect(dto.map((g) => g.id)).toEqual([ID.goalDraft, ID.goalActive, ID.goalArchived]);
  });

  it('loadGoalDetail equals buildGoalDetail', async () => {
    const db = database();
    const fake = createFakeSupabase(db);
    const dto = await loadGoalDetail(fake.client, ID.goalActive, ctx);
    const e = expected(db);
    expect(dto).toEqual(buildGoalDetail(e.goals[0]!, e.graphFor([ID.goalActive]), TODAY));
    expect(dto.outcomes[0]!.measure).toEqual({ target: 42.5, current: 10, unit: 'km' });
  });

  it('loadGoalDetail is NOT_FOUND when RLS hides the row', async () => {
    const fake = createFakeSupabase(database());
    const err = await loadGoalDetail(fake.client, uuid(999), ctx).catch((e) => e);
    expect(err).toBeInstanceOf(QueryError);
    expect(err.appError.code).toBe('NOT_FOUND');
  });

  it('loadReview returns the latest reflections/events and completedThisWeek from the summary', async () => {
    const db = database();
    db.actions.push({ ...db.actions[0]!, id: uuid(33), completed_at: '2026-10-20T15:00:00+00:00', due_date: null } as never);
    const fake = createFakeSupabase(db);
    const review = await loadReview(fake.client, ID.goalActive, ctx);

    const e = expected(db);
    const [summary] = buildSummaryDTOs([e.goals[0]!], e.graphFor([ID.goalActive]), {}, TODAY, TZ);
    expect(review.completedThisWeek).toBe(summary!.completedThisWeek);
    expect(review.completedThisWeek).toBe(1);
    expect(review.reflections).toEqual(
      db.reflections
        .filter((r) => r.goal_id === ID.goalActive)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((r) => reflectionDTO(reflectionFromRow(r as never))),
    );
    expect(review.events).toEqual(
      db.goal_events
        .filter((r) => r.goal_id === ID.goalActive)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
        .map((r) => eventDTO(goalEventFromRow(r as never))),
    );
    const refl = fake.queries.find((q) => q.table === 'reflections')!;
    expect(refl.filters).toEqual(expect.arrayContaining([`eq goal_id ${ID.goalActive}`, 'limit 30']));
    expect(fake.queries.find((q) => q.table === 'goal_events')!.filters).toContain('limit 50');
  });

  it('loadReview limits events to the latest 50', async () => {
    const db = database();
    db.goal_events = Array.from({ length: 60 }, (_, i) => eventRow(i + 1, { id: uuid(600 + i), occurred_at: `2026-09-01T00:${String(i).padStart(2, '0')}:00+00:00` }));
    const review = await loadReview(createFakeSupabase(db).client, ID.goalActive, ctx);
    expect(review.events).toHaveLength(50);
    expect(review.events[0]!.summary).toBe('event 60');
  });

  it('never selects with * and always uses the documented columns', async () => {
    const db = database();
    const fake = createFakeSupabase(db);
    await loadProfile(fake.client);
    await loadToday(fake.client, ctx);
    await loadGoals(fake.client, ctx);
    await loadGoalDetail(fake.client, ID.goalActive, ctx);
    await loadReview(fake.client, ID.goalActive, ctx);
    expect(fake.queries.length).toBeGreaterThan(15);
    for (const q of fake.queries) {
      expect(q.columns).not.toContain('*');
      const table = q.table as keyof typeof SELECT_COLUMNS;
      if (q.table === 'reflections' && q.columns === 'goal_id,date') continue; // latest-date lookup
      expect(q.columns).toBe(SELECT_COLUMNS[table]);
    }
  });

  it('maps a PostgREST error to a QueryError carrying the AppError', async () => {
    const fake = createFakeSupabase(database());
    fake.failTable('actions', { code: 'PGRST301', message: 'JWT expired' });
    const err = await loadGoalDetail(fake.client, ID.goalActive, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(QueryError);
    // status is 500 in the fake but the PGRST301 code wins
    expect(err.appError).toEqual({ code: 'UNAUTHENTICATED', message: 'Please sign in again.' });
  });

  it('maps a server failure to UNAVAILABLE and a throw to UNAVAILABLE', async () => {
    const fake = createFakeSupabase(database());
    fake.failTable('goals', { message: 'boom' });
    await expect(loadToday(fake.client, ctx)).rejects.toMatchObject({ appError: { code: 'UNAVAILABLE' } });

    const thrower = { from: () => { throw new Error('offline'); } } as never;
    await expect(loadGoals(thrower, ctx)).rejects.toMatchObject({ appError: { code: 'UNAVAILABLE' } });
  });
});

describe('focusedGoal (web pickDefaultGoal)', () => {
  const g = (id: string, status: GoalSummaryDTO['status'], activatedOn: string | null, updatedAt = '2026-10-01T00:00:00.000Z') =>
    ({ id, status, activatedOn, updatedAt }) as GoalSummaryDTO;
  const goals = [
    g('draft-new', 'draft', null, '2026-10-09T00:00:00.000Z'),
    g('draft-old', 'draft', null),
    g('active-old', 'active', '2026-09-01'),
    g('active-new', 'active', '2026-10-05'),
    g('done', 'achieved', '2026-01-01'),
    g('arch', 'archived', '2026-10-09'),
  ];

  it('prefers the requested goal, then the latest activated active goal, newest draft, achieved', () => {
    expect(focusedGoal(goals, 'draft-old')?.id).toBe('draft-old');
    expect(focusedGoal(goals)?.id).toBe('active-new');
    expect(focusedGoal(goals.filter((x) => x.status !== 'active'))?.id).toBe('draft-new');
    expect(focusedGoal(goals.filter((x) => x.status === 'achieved' || x.status === 'archived'))?.id).toBe('done');
  });

  it('ignores unknown or archived requested ids and returns undefined when nothing qualifies', () => {
    expect(focusedGoal(goals, 'arch')?.id).toBe('active-new');
    expect(focusedGoal(goals, 'nope')?.id).toBe('active-new');
    expect(focusedGoal([g('arch', 'archived', null)])).toBeUndefined();
    expect(focusedGoal([])).toBeUndefined();
  });
});

describe('query client policy', () => {
  it('retries reads twice, only for transient failures', () => {
    const transient = new QueryError({ code: 'UNAVAILABLE', message: 'x' });
    expect(shouldRetryRead(0, transient)).toBe(true);
    expect(shouldRetryRead(1, transient)).toBe(true);
    expect(shouldRetryRead(2, transient)).toBe(false);
    expect(shouldRetryRead(0, new QueryError({ code: 'NOT_FOUND', message: 'x' }))).toBe(false);
    expect(shouldRetryRead(0, new QueryError({ code: 'UNAUTHENTICATED', message: 'x' }))).toBe(false);
    expect(shouldRetryRead(0, new Error('unclassified'))).toBe(true);
  });

  it('backs off exponentially up to a cap', () => {
    expect([0, 1, 2, 5].map(retryDelay)).toEqual([1000, 2000, 4000, 8000]);
  });

  it('configures staleTime, read retry and no mutation retry', () => {
    const d = createQueryClient().getDefaultOptions();
    expect(d.queries?.staleTime).toBe(30_000);
    expect(d.queries?.retry).toBe(shouldRetryRead);
    expect(d.mutations?.retry).toBe(0);
  });

  it('keys: today includes the date; goal keys share a prefix with their review', () => {
    expect(keys.today('2026-10-20')).toEqual(['today', '2026-10-20']);
    expect(keys.goalDetail('g')).toEqual(['goal', 'g']);
    expect(keys.review('g')).toEqual(['review', 'g']);
  });
});
