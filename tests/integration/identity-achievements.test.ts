import crypto from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Transaction } from '@electric-sql/pglite';
import { ACHIEVEMENTS, ACHIEVEMENT_KEYS } from '@/application/achievements';
import * as uc from '@/application/use-cases';
import type { Ctx } from '@/application/result';
import type { SocialProfileDTO } from '@/application/social';
import { createTestDeps, type TestDeps } from '@/infrastructure/testing/create-test-deps';

/**
 * Founding 100, verified achievements, profile metrics and privacy (supabase/migrations/20261027140000_*.sql),
 * against real Postgres with every migration applied. Founding grants go through the payments migration's
 * admin_entitlement(..., 'founding', ...); its own suite covers grant authorization and the 100 cap.
 */
let t: TestDeps;
let today: string;
const uuid = () => crypto.randomUUID();
const ctxFor = (userId: string): Ctx => ({ userId, now: new Date(), today });

async function as<T>(user: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return t.client.transaction(async (tx) => {
    await tx.query(`select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)`, [
      JSON.stringify({ sub: user, role: 'authenticated' }),
    ]);
    return fn(tx);
  });
}

/** Calls a public RPC as `user`; jsonb input when given, else no arguments. */
async function rpc<T = unknown>(user: string, name: string, input?: unknown): Promise<T> {
  return as(user, async (tx) => {
    const sql = input === undefined ? `select public.${name}() v` : `select public.${name}($1::jsonb) v`;
    const res = await tx.query<{ v: T }>(sql, input === undefined ? [] : [JSON.stringify(input)]);
    return res.rows[0]!.v;
  });
}

const grantFounding = (admin: string, user: string) =>
  as(admin, (tx) => tx.query(`select public.admin_entitlement($1, 'founding', 'Approved application')`, [user]));

async function profileOf(viewer: string, target: string, viewAsPublic = false): Promise<SocialProfileDTO> {
  const res = await uc.getSocialProfile(t.deps, ctxFor(viewer), { userId: target, viewAsPublic });
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}

const achievementKeys = async (user: string) =>
  (
    await t.client.query<{ k: string }>(
      `select achievement_key k from user_achievements where user_id = $1 order by achievement_key`,
      [user],
    )
  ).rows.map((r) => r.k);

/** A goal built directly in SQL (setup only): one key area per entry, `tasks` tasks each, `done` of them completed. */
async function seedGoal(
  owner: string,
  opts: { status?: 'draft' | 'active'; areas?: { tasks: number; done: number }[]; activatedDaysAgo?: number } = {},
) {
  const goalId = uuid();
  const status = opts.status ?? 'active';
  await t.client.query(
    `insert into goals (id, owner_id, title, status, activated_on)
     values ($1, $2, 'Seeded goal', $3, case when $3 = 'active' then current_date - $4::int end)`,
    [goalId, owner, status, opts.activatedDaysAgo ?? 0],
  );
  const areas = opts.areas ?? [];
  for (let i = 0; i < areas.length; i++) {
    const outcomeId = uuid();
    await t.client.query(`insert into outcomes (id, goal_id, title, position) values ($1, $2, $3, $4)`, [
      outcomeId,
      goalId,
      `Area ${i}`,
      i,
    ]);
    for (let j = 0; j < areas[i]!.tasks; j++) {
      await t.client.query(
        `insert into actions (id, goal_id, outcome_id, title, kind, position, completed_at)
         values ($1, $2, $3, $4, 'task', $5, case when $6 then now() end)`,
        [uuid(), goalId, outcomeId, `Task ${i}.${j}`, j, j < areas[i]!.done],
      );
    }
  }
  return goalId;
}

async function addRoutine(goalId: string, position = 7) {
  const outcomeId = (
    await t.client.query<{ id: string }>(`select id from outcomes where goal_id = $1 order by position limit 1`, [goalId])
  ).rows[0]!.id;
  const actionId = uuid();
  await t.client.query(
    `insert into actions (id, goal_id, outcome_id, title, kind, position, schedule_type, start_date)
     values ($1, $2, $3, 'Daily practice', 'routine', $4, 'daily', current_date - 200)`,
    [actionId, goalId, outcomeId, position],
  );
  return actionId;
}

/** A check-in for `daysAgo`, recorded `lateBy` days after that day. */
const checkIn = (actionId: string, daysAgo: number, lateBy = 0) =>
  t.client.query(
    `insert into routine_checks (id, action_id, date, created_at)
     values ($1, $2, current_date - $3::int, (current_date - $3::int + $4::int)::timestamp + interval '12 hours')`,
    [uuid(), actionId, daysAgo, lateBy],
  );

beforeAll(async () => {
  t = await createTestDeps();
  today = (await t.client.query<{ d: string }>(`select to_char(current_date, 'YYYY-MM-DD') d`)).rows[0]!.d;
});

afterAll(async () => {
  await t?.close();
});

describe('Founding 100', () => {
  let admin: string;
  let member: string;
  let viewer: string;

  beforeAll(async () => {
    admin = await t.createUser({ displayName: 'Operator' });
    member = await t.createUser({ displayName: 'First Member' });
    viewer = await t.createUser({ displayName: 'Viewer' });
    await t.client.query(`insert into admins (user_id) values ($1)`, [admin]);
  });

  it('rejects every operator RPC for a non-admin, including self-revocation and listing', async () => {
    await expect(rpc(viewer, 'admin_founding_members')).rejects.toThrow('Not allowed');
    await expect(rpc(viewer, 'admin_search_users', { query: 'first' })).rejects.toThrow('Not allowed');
    await expect(rpc(viewer, 'admin_revoke_founding_member', { userId: viewer, reason: 'x x x' })).rejects.toThrow(
      'Not allowed',
    );
    await expect(rpc(viewer, 'admin_community_metrics')).rejects.toThrow('Not allowed');
  });

  it('gives clients no write path to the designation (table, profile update, posts)', async () => {
    await expect(
      as(viewer, (tx) => tx.query(`insert into founding_members (user_id, member_number, approved_by) values ($1, 1, $1)`, [viewer])),
    ).rejects.toThrow(/permission denied/);
    await expect(as(viewer, (tx) => tx.query(`update founding_members set member_number = 1`))).rejects.toThrow(
      /permission denied/,
    );
    await expect(as(viewer, (tx) => tx.query(`insert into user_achievements (user_id, achievement_key, earned_at) values ($1, 'founding_member', now())`, [viewer]))).rejects.toThrow(/permission denied/);
    // Unknown keys are ignored by update_social_profile; nothing is created.
    await uc.updateSocialProfile(t.deps, ctxFor(viewer), { foundingMember: true, foundingMemberNumber: 1 } as never);
    expect((await profileOf(viewer, viewer)).foundingMember).toBeNull();
  });

  it('an approved member gets the next number, a profile credential and the Founding Member achievement', async () => {
    await grantFounding(admin, member);
    const own = await profileOf(member, member);
    expect(own.foundingMember?.number).toBe(1);
    expect(own.achievements.map((a) => a.key)).toContain('founding_member');

    const seen = await profileOf(viewer, member);
    expect(seen.foundingMember).toMatchObject({ number: 1 });
    expect(seen.achievements.find((a) => a.key === 'founding_member')?.title).toBe('Founding Member');
  });

  it('concurrent approvals receive distinct, consecutive numbers', async () => {
    const users = await Promise.all(Array.from({ length: 6 }, (_, i) => t.createUser({ displayName: `Batch ${i}` })));
    await Promise.all(users.map((u) => grantFounding(admin, u)));
    const { rows } = await t.client.query<{ n: number }>(
      `select member_number n from founding_members where user_id = any($1::uuid[]) order by 1`,
      [users],
    );
    expect(rows.map((r) => r.n)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('the database itself refuses duplicate or out-of-range numbers (backstop for any other writer)', async () => {
    const u = await t.createUser();
    await expect(
      t.client.query(`insert into founding_members (user_id, member_number, approved_by) values ($1, 1, $2)`, [u, admin]),
    ).rejects.toThrow(/unique|duplicate/);
    await expect(
      t.client.query(`insert into founding_members (user_id, member_number, approved_by) values ($1, 101, $2)`, [u, admin]),
    ).rejects.toThrow(/check/);
    await expect(
      t.client.query(`insert into founding_members (user_id, member_number, approved_by) values ($1, 0, $2)`, [u, admin]),
    ).rejects.toThrow(/check/);
  });

  it('persists through subscription changes: Pro granted then revoked leaves the badge in place', async () => {
    const grantId = await as(admin, async (tx) =>
      (await tx.query<{ v: string }>(`select public.admin_entitlement($1, 'grant', 'Comp for testing') v`, [member])).rows[0]!.v,
    );
    await as(admin, (tx) => tx.query(`select public.admin_entitlement($1, 'revoke', 'Comp ended', $2)`, [member, grantId]));
    expect((await profileOf(viewer, member)).foundingMember?.number).toBe(1);
  });

  it('shows the badge beside the name on posts unless the member turns it off', async () => {
    const post = await uc.createSocialPost(t.deps, ctxFor(member), { type: 'progress_update', body: 'First week done.' });
    expect(post.ok && post.data.author.foundingMemberNumber).toBe(1);

    await uc.updateSocialProfile(t.deps, ctxFor(member), { foundingBadgeOnPosts: false });
    const feed = await uc.getSocialFeed(t.deps, ctxFor(viewer), { scope: 'explore' });
    const mine = feed.ok ? feed.data.items.find((p) => p.author.userId === member) : undefined;
    expect(mine?.author.foundingMemberNumber).toBeNull();
    // The profile credential is not optional.
    expect((await profileOf(viewer, member)).foundingMember?.number).toBe(1);
    await uc.updateSocialProfile(t.deps, ctxFor(member), { foundingBadgeOnPosts: true });
  });

  it('operators can search members and list the cohort with places remaining and the audit trail', async () => {
    const found = await rpc<{ items: { userId: string; foundingMemberNumber: number | null }[] }>(
      admin,
      'admin_search_users',
      { query: 'first member' },
    );
    expect(found.items.find((i) => i.userId === member)?.foundingMemberNumber).toBe(1);

    const list = await rpc<{ capacity: number; remaining: number; nextNumber: number; members: { memberNumber: number }[] }>(
      admin,
      'admin_founding_members',
    );
    expect(list.capacity).toBe(100);
    expect(list.members.map((m) => m.memberNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(list.remaining).toBe(93);
    expect(list.nextNumber).toBe(8);
  });

  it('revocation needs an admin and a reason, is audited, and removes the badge and the achievement', async () => {
    await expect(rpc(admin, 'admin_revoke_founding_member', { userId: member, reason: '' })).rejects.toThrow();
    const res = await rpc<{ memberNumber: number }>(admin, 'admin_revoke_founding_member', {
      userId: member,
      reason: 'Approved in error',
    });
    expect(res.memberNumber).toBe(1);
    const p = await profileOf(viewer, member);
    expect(p.foundingMember).toBeNull();
    expect(p.achievements.map((a) => a.key)).not.toContain('founding_member');

    const audit = await rpc<{ audit: { action: string; reason: string; target: string }[] }>(admin, 'admin_founding_members');
    expect(audit.audit[0]).toMatchObject({ action: 'founding_revoked' });
    expect(audit.audit[0]!.reason).toContain('Approved in error');

    await expect(rpc(admin, 'admin_revoke_founding_member', { userId: member, reason: 'again' })).rejects.toThrow(
      'Not a Founding Member',
    );
  });
});

describe('Profile progress metrics', () => {
  let owner: string;
  let viewer: string;
  let goalId: string;
  let routineId: string;

  beforeAll(async () => {
    owner = await t.createUser({ displayName: 'Metric Owner' });
    viewer = await t.createUser({ displayName: 'Metric Viewer' });
    // 2 key areas: area 0 has 2 tasks (1 done), area 1 has 1 task (done). Activated 9 days ago.
    goalId = await seedGoal(owner, { areas: [{ tasks: 2, done: 1 }, { tasks: 1, done: 1 }], activatedDaysAgo: 9 });
    routineId = await addRoutine(goalId);
    await checkIn(routineId, 0); // today, on time
    await checkIn(routineId, 3, 1); // recorded a day late: counts
    await checkIn(routineId, 6, 5); // back-filled 5 days later: does not count
  });

  it('an empty profile has no primary goal, no metrics and no achievements', async () => {
    const p = await profileOf(viewer, viewer);
    expect(p.primaryGoal).toBeNull();
    expect(p.achievements).toEqual([]);
    expect(p.foundingMember).toBeNull();
  });

  it('a private goal never becomes the primary goal, for anyone', async () => {
    const seen = await profileOf(viewer, owner);
    expect(seen.primaryGoal).toBeNull();
    expect(JSON.stringify(seen)).not.toContain('Seeded goal');
    expect((await profileOf(owner, owner)).primaryGoal).toBeNull();
  });

  it('computes days, actions, consistency and key areas from recorded activity only', async () => {
    await uc.setGoalVisibility(t.deps, ctxFor(owner), { goalId, visibility: 'public' });
    const m = (await profileOf(viewer, owner)).primaryGoal!.metrics!;
    expect(m.daysPursuing).toBe(10);
    expect(m.tasksCompleted).toBe(2);
    expect(m.tasksTotal).toBe(3);
    expect(m.routineCheckins).toBe(2); // the back-filled one is excluded
    expect(m.actionsCompleted).toBe(4);
    expect(m.keyAreasComplete).toBe(1);
    expect(m.keyAreasTotal).toBe(2);
    // Active days in the window: today (tasks + check-in) and 3 days ago. Window = 10 days since activation.
    expect(m.consistency).toEqual({ activeDays: 2, windowDays: 10, rate: 0.2 });
  });

  it('reopening a task and archiving an action remove them from every count (no phantom progress)', async () => {
    await t.client.query(
      `update actions set completed_at = null where goal_id = $1 and kind = 'task' and outcome_id =
         (select id from outcomes where goal_id = $1 and position = 1)`,
      [goalId],
    );
    await t.client.query(`update actions set archived_at = now(), position = null where id = $1`, [routineId]);
    const m = (await profileOf(viewer, owner)).primaryGoal!.metrics!;
    expect(m.tasksCompleted).toBe(1);
    expect(m.routineCheckins).toBe(0);
    expect(m.actionsCompleted).toBe(1);
    expect(m.keyAreasComplete).toBe(0);
  });

  it('hiding progress metrics hides them from others but not from the owner', async () => {
    await uc.updateSocialProfile(t.deps, ctxFor(owner), { showProgressMetrics: false });
    const seen = await profileOf(viewer, owner);
    expect(seen.primaryGoal?.title).toBe('Seeded goal');
    expect(seen.primaryGoal?.metrics).toBeNull();
    expect((await profileOf(owner, owner)).primaryGoal?.metrics).not.toBeNull();
    expect((await profileOf(owner, owner, true)).primaryGoal?.metrics).toBeNull();
    expect((await profileOf(owner, owner)).privacy).toMatchObject({ showProgressMetrics: false });
    expect(seen.privacy).toBeNull();
    await uc.updateSocialProfile(t.deps, ctxFor(owner), { showProgressMetrics: true });
  });

  it('a private profile exposes neither the primary goal nor achievements', async () => {
    await uc.updateSocialProfile(t.deps, ctxFor(owner), { isPrivate: true });
    const seen = await profileOf(viewer, owner);
    expect(seen.restricted).toBe(true);
    expect(seen.primaryGoal).toBeNull();
    expect(seen.achievements).toEqual([]);
    await uc.updateSocialProfile(t.deps, ctxFor(owner), { isPrivate: false });
  });

  it('rejects non-boolean privacy settings', async () => {
    const res = await t.deps.uow
      .run(owner, (r) => r.social.callRpc('update_social_profile', { showAchievements: 'yes' }))
      .catch((e: Error & { cause?: Error }) => e.cause ?? e);
    expect(String(res)).toMatch(/Invalid privacy setting/);
  });
});

describe('Achievements', () => {
  let user: string;
  let viewer: string;

  beforeAll(async () => {
    user = await t.createUser({ displayName: 'Achiever' });
    viewer = await t.createUser({ displayName: 'Onlooker' });
  });

  it('awards Goal Completed and First Goal Completed once, however often the goal is reopened', async () => {
    const g = await uc.createGoal(t.deps, ctxFor(user), { title: 'Learn to swim' });
    if (!g.ok) throw new Error(g.error.message);
    const o = await uc.addOutcome(t.deps, ctxFor(user), { goalId: g.data.id, title: 'Technique' });
    if (!o.ok) throw new Error(o.error.message);
    await uc.addAction(t.deps, ctxFor(user), { outcomeId: o.data.id, title: 'Lesson', kind: 'task' });
    expect((await uc.activateGoal(t.deps, ctxFor(user), { goalId: g.data.id })).ok).toBe(true);
    for (let i = 0; i < 3; i++) {
      expect((await uc.markGoalAchieved(t.deps, ctxFor(user), { goalId: g.data.id })).ok).toBe(true);
      expect((await uc.reopenGoal(t.deps, ctxFor(user), { goalId: g.data.id })).ok).toBe(true);
    }
    expect(await achievementKeys(user)).toEqual([]);
    await uc.markGoalAchieved(t.deps, ctxFor(user), { goalId: g.data.id });
    expect(await achievementKeys(user)).toEqual(['first_goal_completed', 'goal_completed']);
  });

  it('completing and reopening a task repeatedly never creates more than one row per achievement', async () => {
    const goal = await seedGoal(user, { status: 'draft', areas: Array.from({ length: 8 }, () => ({ tasks: 8, done: 8 })) });
    // 64 tasks done + the plan is full.
    expect(await achievementKeys(user)).toContain('plan_complete');
    const extra = await seedGoal(user, { status: 'draft', areas: [{ tasks: 8, done: 8 }, { tasks: 8, done: 8 }, { tasks: 8, done: 8 }, { tasks: 8, done: 8 }, { tasks: 8, done: 8 }] });
    expect(await achievementKeys(user)).toContain('actions_100');
    for (let i = 0; i < 3; i++) {
      await t.client.query(`update actions set completed_at = null where goal_id = $1`, [extra]);
      await t.client.query(`update actions set completed_at = now() where goal_id = $1`, [extra]);
    }
    const { rows } = await t.client.query<{ n: number }>(
      `select count(*)::int n from user_achievements where user_id = $1 group by achievement_key order by 1 desc limit 1`,
      [user],
    );
    expect(rows[0]!.n).toBe(1);
    // Deleting the records behind an achievement removes it.
    await t.client.query(`delete from goals where id = $1`, [extra]);
    expect(await achievementKeys(user)).not.toContain('actions_100');
    await t.client.query(`delete from goals where id = $1`, [goal]);
    expect(await achievementKeys(user)).not.toContain('plan_complete');
  });

  it('counts 30 distinct days of on-time progress, and ignores back-filled check-ins', async () => {
    const g = await seedGoal(user, { status: 'draft', areas: [{ tasks: 0, done: 0 }] });
    const routine = await addRoutine(g, 0);
    for (let d = 1; d <= 29; d++) await checkIn(routine, d);
    expect(await achievementKeys(user)).not.toContain('active_days_30');
    await checkIn(routine, 40, 10); // back-filled: ignored
    expect(await achievementKeys(user)).not.toContain('active_days_30');
    await checkIn(routine, 0);
    expect(await achievementKeys(user)).toContain('active_days_30');
    const earned = (
      await t.client.query<{ d: string }>(
        `select to_char(earned_at at time zone 'UTC', 'YYYY-MM-DD') d from user_achievements
         where user_id = $1 and achievement_key = 'active_days_30'`,
        [user],
      )
    ).rows[0]!.d;
    expect(earned).toBe(today); // the day the 30th active day happened
  });

  it('goal-tied achievements are visible to others only while the goal is public; hidden ones never', async () => {
    let seen = await profileOf(viewer, user);
    expect(seen.achievements.map((a) => a.key)).not.toContain('goal_completed');
    expect(seen.achievements.map((a) => a.key)).toContain('first_goal_completed');

    const goalId = (
      await t.client.query<{ id: string }>(`select id from goals where owner_id = $1 and title = 'Learn to swim'`, [user])
    ).rows[0]!.id;
    await uc.setGoalVisibility(t.deps, ctxFor(user), { goalId, visibility: 'public' });
    seen = await profileOf(viewer, user);
    expect(seen.achievements.find((a) => a.key === 'goal_completed')?.goal?.title).toBe('Learn to swim');

    const first = seen.achievements.find((a) => a.key === 'first_goal_completed')!;
    const hide = await uc.setAchievementVisibility(t.deps, ctxFor(user), { achievementId: first.id, hidden: true });
    expect(hide.ok).toBe(true);
    expect((await profileOf(viewer, user)).achievements.map((a) => a.key)).not.toContain('first_goal_completed');
    expect((await profileOf(user, user)).achievements.find((a) => a.id === first.id)?.hidden).toBe(true);

    await uc.updateSocialProfile(t.deps, ctxFor(user), { showAchievements: false });
    expect((await profileOf(viewer, user)).achievements).toEqual([]);
    await uc.updateSocialProfile(t.deps, ctxFor(user), { showAchievements: true });
  });

  it("nobody can hide, show or share someone else's achievement", async () => {
    const a = (await profileOf(user, user)).achievements[0]!;
    expect(await uc.setAchievementVisibility(t.deps, ctxFor(viewer), { achievementId: a.id, hidden: false })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(
      await uc.createSocialPost(t.deps, ctxFor(viewer), { type: 'achievement', achievementId: a.id }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await uc.createSocialPost(t.deps, ctxFor(viewer), { type: 'achievement' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
  });

  it('shares an achievement as one verified post with a fixed title; sharing again returns the same post', async () => {
    const ach = (await profileOf(user, user)).achievements.find((a) => a.key === 'goal_completed')!;
    const first = await uc.createSocialPost(t.deps, ctxFor(user), {
      type: 'achievement',
      achievementId: ach.id,
      body: 'Took me a year.',
    });
    if (!first.ok) throw new Error(first.error.message);
    expect(first.data).toMatchObject({
      type: 'achievement',
      headline: 'Goal Completed',
      achievement: { id: ach.id, key: 'goal_completed', title: 'Goal Completed' },
      goal: { title: 'Learn to swim' },
    });
    const again = await uc.createSocialPost(t.deps, ctxFor(user), { type: 'achievement', achievementId: ach.id });
    expect(again.ok && again.data.id).toBe(first.data.id);

    const retitle = await uc.updateSocialPost(t.deps, ctxFor(user), { postId: first.data.id, headline: 'Ran a marathon' });
    expect(retitle).toMatchObject({ ok: false, error: { code: 'INVALID_STATE' } });
    const reword = await uc.updateSocialPost(t.deps, ctxFor(user), { postId: first.data.id, body: 'One year.' });
    expect(reword.ok).toBe(true);

    const seen = await uc.getSocialPost(t.deps, ctxFor(viewer), { postId: first.data.id });
    expect(seen.ok && seen.data.achievement?.title).toBe('Goal Completed');
  });

  it('refuses a public post for an achievement of a private goal', async () => {
    const goalId = (
      await t.client.query<{ id: string }>(`select id from goals where owner_id = $1 and title = 'Learn to swim'`, [user])
    ).rows[0]!.id;
    await uc.setGoalVisibility(t.deps, ctxFor(user), { goalId, visibility: 'private' });
    // The existing post disappears from others' view with the goal.
    const feed = await uc.getSocialFeed(t.deps, ctxFor(viewer), { scope: 'explore' });
    expect(feed.ok && feed.data.items.some((p) => p.type === 'achievement' && p.author.userId === user)).toBe(false);

    await t.client.query(`delete from social_posts where author_id = $1 and type = 'achievement'`, [user]);
    const ach = (await profileOf(user, user)).achievements.find((a) => a.key === 'goal_completed')!;
    const res = await uc.createSocialPost(t.deps, ctxFor(user), { type: 'achievement', achievementId: ach.id });
    expect(res).toMatchObject({ ok: false, error: { code: 'INVALID_STATE' } });
    const priv = await uc.createSocialPost(t.deps, ctxFor(user), {
      type: 'achievement',
      achievementId: ach.id,
      visibility: 'private',
    });
    expect(priv.ok).toBe(true);
  });

  it('deleting the goal deletes its achievements and their posts', async () => {
    const goalId = (
      await t.client.query<{ id: string }>(`select id from goals where owner_id = $1 and title = 'Learn to swim'`, [user])
    ).rows[0]!.id;
    await t.client.query(`delete from goals where id = $1`, [goalId]);
    expect(await achievementKeys(user)).not.toContain('goal_completed');
    expect(await achievementKeys(user)).not.toContain('first_goal_completed');
    const { rows } = await t.client.query(`select 1 from social_posts where author_id = $1 and type = 'achievement'`, [
      user,
    ]);
    expect(rows).toEqual([]);
  });
});

describe('Social safety and analytics', () => {
  it('lists and unblocks blocked accounts; blocked users cannot see the profile', async () => {
    const a = await t.createUser({ displayName: 'Blocker' });
    const b = await t.createUser({ displayName: 'Blocked' });
    await uc.blockUser(t.deps, ctxFor(a), { targetUserId: b });
    const list = await uc.listBlockedUsers(t.deps, ctxFor(a));
    expect(list.ok && list.data.items.map((i) => i.userId)).toEqual([b]);
    expect((await uc.getSocialProfile(t.deps, ctxFor(b), { userId: a })).ok).toBe(false);
    await uc.unblockUser(t.deps, ctxFor(a), { targetUserId: b });
    const after = await uc.listBlockedUsers(t.deps, ctxFor(a));
    expect(after.ok && after.data.items).toEqual([]);
  });

  it('records follow, post, goal completion, profile view and founding badge view events without free text', async () => {
    const admin = await t.createUser();
    const founder = await t.createUser({ displayName: 'Founder' });
    const fan = await t.createUser({ displayName: 'Fan' });
    await t.client.query(`insert into admins (user_id) values ($1)`, [admin]);
    await grantFounding(admin, founder);

    await uc.followUser(t.deps, ctxFor(fan), { targetUserId: founder });
    await uc.createSocialPost(t.deps, ctxFor(fan), { type: 'progress_update', body: 'Secret plan details' });
    const view = await uc.recordProfileView(t.deps, ctxFor(fan), { userId: founder });
    expect(view).toEqual({ ok: true, data: { recorded: true } });
    expect(await uc.recordProfileView(t.deps, ctxFor(fan), { userId: fan })).toEqual({
      ok: true,
      data: { recorded: false },
    });

    const { rows } = await t.client.query<{ name: string; props: unknown }>(
      `select name, props from analytics_events where user_id = $1 order by id`,
      [fan],
    );
    expect(rows.map((r) => r.name)).toEqual([
      'user_followed',
      'progress_post_created',
      'profile_viewed',
      'founding_badge_viewed',
    ]);
    expect(JSON.stringify(rows)).not.toContain('Secret');

    // Clients cannot fabricate server-recorded events.
    await expect(as(fan, (tx) => tx.query(`select public.track_event('achievement_shared', '{}'::jsonb)`))).rejects.toThrow(
      'Recorded by the server',
    );

    const metrics = await rpc<{ events30d: Record<string, { count: number }> }>(admin, 'admin_community_metrics');
    expect(metrics.events30d.founding_badge_viewed?.count).toBeGreaterThanOrEqual(1);
  });
});

describe('Achievement catalogue', () => {
  it('the database and src/application/achievements.ts agree on keys and titles', async () => {
    const check = (
      await t.client.query<{ def: string }>(
        `select pg_get_constraintdef(oid) def from pg_constraint where conname = 'user_achievements_key_check'`,
      )
    ).rows[0]!.def;
    expect([...check.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]).sort()).toEqual([...ACHIEVEMENT_KEYS].sort());
    for (const key of ACHIEVEMENT_KEYS) {
      const { rows } = await t.client.query<{ title: string }>(`select harada_private.achievement_title($1) title`, [key]);
      expect(rows[0]!.title, key).toBe(ACHIEVEMENTS[key].title);
    }
  });
});
