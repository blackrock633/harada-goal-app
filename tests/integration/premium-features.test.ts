import crypto from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { createTestDeps, type TestDeps } from '@/infrastructure/testing/create-test-deps';
import { TEMPLATES } from '@/domain/templates';

/**
 * Plans, entitlements, reviews, templates, history, challenge, sharing, referrals, analytics, billing and admin
 * (migrations 20261026*), exercised the way the mobile app and Edge Functions reach them: PostgREST calls as
 * `authenticated` with JWT claims, as `anon`, or as `service_role`. Real migrations on PGlite.
 */
type Who = { sub: string } | 'anon' | 'service_role';
const uuid = () => crypto.randomUUID();

async function as<T>(client: PGlite, who: Who, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return client.transaction(async (tx) => {
    if (who === 'anon' || who === 'service_role') await tx.query(`select set_config('role',$1,true)`, [who]);
    else
      await tx.query(`select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)`, [
        JSON.stringify({ sub: who.sub, role: 'authenticated' }),
      ]);
    return fn(tx);
  });
}

/** Calls `select public.<fn>(args)` and returns the single value, or throws with the SQLSTATE in `.code`. */
async function call<T = unknown>(client: PGlite, who: Who, fn: string, ...args: unknown[]): Promise<T> {
  const params = args.map((a) => (typeof a === 'object' && a !== null ? JSON.stringify(a) : a));
  const placeholders = args.map((a, i) => (typeof a === 'object' && a !== null ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(', ');
  return as(client, who, async (tx) => (await tx.query<{ r: T }>(`select to_jsonb(public.${fn}(${placeholders})) r`, params)).rows[0]!.r);
}

async function code(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code ?? (e as Error).message;
  }
}

/** Stripe-shaped event for billing_apply (the webhook's normalised form). */
function stripeEvent(over: Record<string, unknown>) {
  return {
    eventId: `evt_${uuid()}`,
    eventType: 'customer.subscription.updated',
    created: Math.floor(Date.now() / 1000),
    customerId: 'cus_test',
    subscriptionId: 'sub_test',
    status: 'active',
    stripePriceId: 'price_monthly_test',
    amountCents: 799,
    interval: 'month',
    currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 86400,
    cancelAtPeriodEnd: false,
    ...over,
  };
}

describe('premium features (database)', () => {
  let t: TestDeps;
  let c: PGlite;
  let today = '';

  /** A user with one activatable goal (one key area, a task and a routine). */
  async function userWithGoal(activate = true) {
    const id = await t.createUser();
    const g = await call<{ id: string }>(c, { sub: id }, 'create_goal', {
      title: 'Private goal title',
      vision: 'Private vision text',
      outcomes: [{ title: 'Area one', actions: [{ title: 'Task one', kind: 'task' }, { title: 'Daily routine', kind: 'routine', schedule: { type: 'daily' } }] }],
    });
    if (activate) await call(c, { sub: id }, 'activate_goal', { goalId: g.id });
    return { user: id, goal: g.id };
  }
  const grantPro = (user: string) => c.query(`insert into plan_grants (user_id, plan_id, reason) values ($1,'pro','test')`, [user]);

  beforeAll(async () => {
    t = await createTestDeps();
    c = t.client;
    await c.query(`update prices set stripe_price_id = 'price_monthly_test' where id = 'pro_monthly'`);
    await c.query(`update prices set stripe_price_id = 'price_annual_test' where id = 'pro_annual'`);
    today = (await c.query<{ d: string }>(`select to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD') d`)).rows[0]!.d;
  });
  afterAll(() => t?.close());

  describe('plans and entitlements', () => {
    it('a new user is on Free with a limit of one active goal; the catalogue is public', async () => {
      const { user } = await userWithGoal();
      const plan = await call<Record<string, unknown>>(c, { sub: user }, 'get_my_plan');
      expect(plan).toMatchObject({ plan: 'free', features: [], maxActiveGoals: 1, activeGoals: 1, overLimit: false, subscription: null });
      const prices = await as(c, 'anon', async (tx) => (await tx.query(`select id, amount_cents, billing_interval from prices order by sort_order`)).rows);
      expect(prices).toEqual([
        { id: 'pro_monthly', amount_cents: 799, billing_interval: 'month' },
        { id: 'pro_annual', amount_cents: 4999, billing_interval: 'year' },
      ]);
      expect(await code(as(c, 'anon', (tx) => tx.query(`select stripe_price_id from prices`)))).toBe('42501');
    });

    it('Free: activating a second goal over RPC raises HG402 and leaves it a draft; completing or archiving the first allows activating the second', async () => {
      const { user, goal } = await userWithGoal();
      const g2 = await call<{ id: string }>(c, { sub: user }, 'create_goal', { title: 'Second', outcomes: [{ title: 'A', actions: [{ title: 'T', kind: 'task' }] }] });
      expect(await code(call(c, { sub: user }, 'activate_goal', { goalId: g2.id }))).toBe('HG402');
      expect((await c.query<{ status: string }>(`select status from goals where id = $1`, [g2.id])).rows[0]!.status).toBe('draft');

      // Completing the first active goal frees the single active-goal slot on Free.
      await call(c, { sub: user }, 'mark_goal_achieved', { goalId: goal });
      await call(c, { sub: user }, 'activate_goal', { goalId: g2.id });
      expect((await c.query<{ status: string }>(`select status from goals where id = $1`, [g2.id])).rows[0]!.status).toBe('active');
      // Reopening the achieved goal while g2 is active is also blocked by the limit.
      expect(await code(call(c, { sub: user }, 'reopen_goal', { goalId: goal }))).toBe('HG402');

      // Archiving g2 allows reopening the first goal.
      await call(c, { sub: user }, 'archive_goal', { goalId: g2.id });
      await call(c, { sub: user }, 'reopen_goal', { goalId: goal });
      expect((await c.query<{ status: string }>(`select status from goals where id = $1`, [goal])).rows[0]!.status).toBe('active');
    });

    it('Free: concurrent activation attempts allow at most one active goal', async () => {
      const { user, goal } = await userWithGoal(false);
      const g2 = await call<{ id: string }>(c, { sub: user }, 'create_goal', { title: 'Second', outcomes: [{ title: 'A', actions: [{ title: 'T', kind: 'task' }] }] });
      const results = await Promise.all([
        code(call(c, { sub: user }, 'activate_goal', { goalId: goal })),
        code(call(c, { sub: user }, 'activate_goal', { goalId: g2.id })),
      ]);
      expect(results.sort()).toEqual(['HG402', undefined]);
      const activeCount = (await c.query<{ n: number }>(`select count(*)::int as n from goals where owner_id = $1 and status = 'active'`, [user])).rows[0]!.n;
      expect(activeCount).toBe(1);
    });

    it('Pro via a Stripe subscription: several active goals; the plan reports the subscription without Stripe ids', async () => {
      const { user } = await userWithGoal();
      await call(c, 'service_role', 'billing_link_customer', user, 'cus_pro1');
      expect(await call(c, 'service_role', 'billing_apply', stripeEvent({ customerId: 'cus_pro1', subscriptionId: 'sub_pro1' }))).toBe('applied');
      const g2 = await call<{ id: string }>(c, { sub: user }, 'create_goal', { title: 'Second', outcomes: [{ title: 'A', actions: [{ title: 'T', kind: 'task' }] }] });
      await call(c, { sub: user }, 'activate_goal', { goalId: g2.id });
      const plan = await call<Record<string, unknown>>(c, { sub: user }, 'get_my_plan');
      expect(plan).toMatchObject({ plan: 'pro', maxActiveGoals: null, activeGoals: 2, subscription: { status: 'active', priceId: 'pro_monthly', hasBillingAccount: true } });
      expect(JSON.stringify(plan)).not.toMatch(/cus_|sub_/);
    });

    it('subscription states: cancel at period end keeps Pro until it ends; past_due gets 3 days; expired is Free', async () => {
      const now = Math.floor(Date.now() / 1000);
      const plan = async (over: Record<string, unknown>) => {
        const user = await t.createUser();
        const cus = `cus_${uuid()}`;
        await call(c, 'service_role', 'billing_link_customer', user, cus);
        await call(c, 'service_role', 'billing_apply', stripeEvent({ customerId: cus, subscriptionId: `sub_${uuid()}`, ...over }));
        return (await call<{ plan: string }>(c, { sub: user }, 'get_my_plan')).plan;
      };
      expect(await plan({ cancelAtPeriodEnd: true })).toBe('pro');
      expect(await plan({ status: 'canceled', currentPeriodEnd: now - 60 })).toBe('free');
      expect(await plan({ status: 'active', currentPeriodEnd: now - 60 })).toBe('free');
      expect(await plan({ status: 'past_due', currentPeriodEnd: now - 86400 })).toBe('pro');
      expect(await plan({ status: 'past_due', currentPeriodEnd: now - 4 * 86400 })).toBe('free');
      expect(await plan({ status: 'unpaid' })).toBe('free');
      expect(await plan({ status: 'trialing' })).toBe('pro');
    });

    it('downgrade keeps every goal; choose_active_goal archives the others (restorable) and clears overLimit', async () => {
      const { user, goal } = await userWithGoal();
      await grantPro(user);
      const g2 = await call<{ id: string }>(c, { sub: user }, 'create_goal', { title: 'Second', outcomes: [{ title: 'A', actions: [{ title: 'T', kind: 'task' }] }] });
      await call(c, { sub: user }, 'activate_goal', { goalId: g2.id });
      await c.query(`delete from plan_grants where user_id = $1`, [user]);
      expect(await call(c, { sub: user }, 'get_my_plan')).toMatchObject({ plan: 'free', activeGoals: 2, overLimit: true });
      // Still fully readable and editable while over the limit.
      await call(c, { sub: user }, 'update_goal', { goalId: g2.id, title: 'Second, renamed' });
      await as(c, { sub: user }, (tx) => tx.query(`select public.choose_active_goal($1::jsonb)`, [JSON.stringify({ goalId: goal })]));
      const rows = (await c.query<{ id: string; status: string }>(`select id, status from goals where owner_id = $1`, [user])).rows;
      expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({ [goal]: 'active', [g2.id]: 'archived' });
      expect(await call(c, { sub: user }, 'get_my_plan')).toMatchObject({ overLimit: false });
      // Restoring it as active needs Pro again.
      expect(await code(call(c, { sub: user }, 'restore_goal', { goalId: g2.id }))).toBe('HG402');
    });

    it('nobody but the service role can write billing state', async () => {
      const { user } = await userWithGoal();
      expect(await code(call(c, { sub: user }, 'billing_apply', stripeEvent({ customerId: 'cus_x' })))).toBe('42501');
      expect(await code(call(c, { sub: user }, 'billing_link_customer', user, 'cus_x'))).toBe('42501');
      expect(await code(as(c, { sub: user }, (tx) => tx.query(`insert into plan_grants (user_id, plan_id, reason) values ($1,'pro','x')`, [user])))).toBe('42501');
      expect(await code(as(c, { sub: user }, (tx) => tx.query(`select * from subscriptions`)))).toBe('42501');
      expect(await code(as(c, { sub: user }, (tx) => tx.query(`update plans set max_active_goals = 99`)))).toBe('42501');
    });
  });

  describe('billing webhook state (billing_apply)', () => {
    it('is idempotent on the event id and ignores out-of-order (older) events', async () => {
      const { user } = await userWithGoal();
      await call(c, 'service_role', 'billing_link_customer', user, 'cus_order');
      const t0 = Math.floor(Date.now() / 1000);
      const ev = stripeEvent({ customerId: 'cus_order', subscriptionId: 'sub_order', created: t0 });
      expect(await call(c, 'service_role', 'billing_apply', ev)).toBe('applied');
      expect(await call(c, 'service_role', 'billing_apply', ev)).toBe('duplicate');
      // A later cancellation, then a delayed older "active" event: the cancellation stands.
      await call(c, 'service_role', 'billing_apply', stripeEvent({ customerId: 'cus_order', subscriptionId: 'sub_order', created: t0 + 10, status: 'canceled', currentPeriodEnd: t0 - 1 }));
      expect(await call(c, 'service_role', 'billing_apply', stripeEvent({ customerId: 'cus_order', subscriptionId: 'sub_order', created: t0 + 5 }))).toBe('ignored');
      expect((await call<{ plan: string }>(c, { sub: user }, 'get_my_plan')).plan).toBe('free');
      const events = (await c.query<{ name: string }>(`select name from analytics_events where user_id = $1 order by id`, [user])).rows.map((r) => r.name);
      expect(events).toEqual(['subscription_activated', 'subscription_cancelled']);
    });

    it('finds the user from checkout metadata when the customer was not linked; ignores unknown customers', async () => {
      const { user } = await userWithGoal();
      expect(await call(c, 'service_role', 'billing_apply', stripeEvent({ customerId: 'cus_meta', subscriptionId: 'sub_meta', userId: user }))).toBe('applied');
      expect((await call<{ plan: string }>(c, { sub: user }, 'get_my_plan')).plan).toBe('pro');
      expect(await call(c, 'service_role', 'billing_apply', stripeEvent({ customerId: 'cus_nobody', subscriptionId: 'sub_nobody' }))).toBe('ignored');
    });
  });

  describe('advanced reviews', () => {
    it('Free: only daily reflections are allowed; weekly and monthly require Pro; downgrade preserves data and re-upgrade restores access', async () => {
      const { user, goal } = await userWithGoal();
      const daily = await call<{ id: string }>(c, { sub: user }, 'add_reflection', { goalId: goal, date: today, kind: 'daily', wentWell: 'ok' });
      expect(await code(call(c, { sub: user }, 'add_reflection', { goalId: goal, date: today, kind: 'weekly', wentWell: 'ok' }))).toBe('HG402');
      expect(await code(call(c, { sub: user }, 'add_reflection', { goalId: goal, date: today, kind: 'monthly', wentWell: 'ok' }))).toBe('HG402');
      expect(await code(call(c, { sub: user }, 'add_reflection', { goalId: goal, date: today, kind: 'weekly', answers: { learned: 'x' } }))).toBe('HG402');
      expect(await code(call(c, { sub: user }, 'update_reflection', { reflectionId: daily.id, kind: 'weekly' }))).toBe('HG402');

      await grantPro(user);
      const r = await call<{ id: string; answers: Record<string, string> }>(c, { sub: user }, 'add_reflection', {
        goalId: goal, date: today, kind: 'weekly', wentWell: 'Shipped', answers: { intended: ' Plan ', learned: 'Lesson', priorities: '' },
      });
      expect(r.answers).toEqual({ intended: 'Plan', learned: 'Lesson' });
      const editedPro = await call<{ went_well: string; answers: Record<string, string> }>(c, { sub: user }, 'update_reflection', {
        reflectionId: r.id, wentWell: 'Shipped v2',
      });
      expect(editedPro).toMatchObject({ went_well: 'Shipped v2', answers: { intended: 'Plan', learned: 'Lesson' } });
      await call(c, { sub: user }, 'add_reflection', { goalId: goal, date: today, kind: 'monthly', answers: { strategy: 'Keep going' } });
      expect(await code(call(c, { sub: user }, 'add_reflection', { goalId: goal, date: today, kind: 'weekly', answers: { secret: 'x' } }))).toBe('HG400');

      await c.query(`delete from plan_grants where user_id = $1`, [user]);
      // After downgrade: Free cannot edit or delete weekly/monthly reflections, and SELECT returns only daily reflections.
      expect(await code(call(c, { sub: user }, 'update_reflection', { reflectionId: r.id, wentWell: 'Tamper' }))).toBe('HG402');
      expect(await code(call(c, { sub: user }, 'update_reflection', { reflectionId: r.id, answers: { learned: 'changed' } }))).toBe('HG402');
      expect(await code(call(c, { sub: user }, 'delete_reflection', { reflectionId: r.id }))).toBe('HG402');
      const freeVisible = await as(c, { sub: user }, async (tx) => (await tx.query<{ kind: string }>(`select kind from public.reflections where goal_id = $1`, [goal])).rows);
      expect(freeVisible.map((x) => x.kind)).toEqual(['daily']);

      // All weekly and monthly reflections remain intact in the database and become accessible again on re-upgrade.
      const storedCount = (await c.query<{ n: number }>(`select count(*)::int as n from reflections where goal_id = $1`, [goal])).rows[0]!.n;
      expect(storedCount).toBe(3);
      await grantPro(user);
      const proVisible = await as(c, { sub: user }, async (tx) => (await tx.query<{ id: string; kind: string; went_well: string }>(`select id, kind, went_well from public.reflections where goal_id = $1`, [goal])).rows);
      expect(proVisible.map((x) => x.kind).sort()).toEqual(['daily', 'monthly', 'weekly']);
      expect(proVisible.find((x) => x.id === r.id)?.went_well).toBe('Shipped v2');
    });
  });

  describe('templates', () => {
    it('Free sees premium templates as locked and cannot open their content; Pro can', async () => {
      const { user } = await userWithGoal();
      const list = await as(c, { sub: user }, async (tx) => (await tx.query<{ id: string; tier: string; locked: boolean; outcome_count: number }>(`select * from public.list_templates()`)).rows);
      expect(list.filter((x) => x.tier === 'free').map((x) => x.id).sort()).toEqual(['4-0-gpa', 'marathon', 'product-launch', 'varsity-soccer']);
      expect(list.filter((x) => x.tier === 'premium').map((x) => x.id).sort()).toEqual(
        ['academic-performance', 'athletic-development', 'language-learning', 'professional-skill', 'startup-launch']);
      expect(list.filter((x) => x.tier === 'premium').every((x) => x.locked && x.outcome_count === 8)).toBe(true);
      expect(list.filter((x) => x.tier === 'free').every((x) => !x.locked)).toBe(true);
      expect(await code(call(c, { sub: user }, 'get_template', 'startup-launch'))).toBe('HG402');
      expect((await call<{ goalTitle: string }>(c, { sub: user }, 'get_template', 'marathon')).goalTitle).toBe('Finish the City Marathon');
      expect(await code(as(c, { sub: user }, (tx) => tx.query(`select content from goal_templates`)))).toBe('42501');
      expect(await code(call(c, 'anon', 'list_templates'))).toBe('42501');

      await grantPro(user);
      const tpl = await call<{ outcomes: unknown[]; tier: string }>(c, { sub: user }, 'get_template', 'startup-launch');
      expect(tpl.tier).toBe('premium');
      expect(tpl.outcomes).toHaveLength(8);
    });
  });

  it('templates-sync: the free templates in the database are the ones the apps ship', async () => {
    const rows = (await c.query<{ id: string; name: string; summary: string; content: Record<string, unknown> }>(
      `select id, name, summary, content from goal_templates where tier = 'free' order by sort_order`)).rows;
    expect(rows.map(({ id, name, summary, content }) => ({ id, name, summary, ...content }))).toEqual(
      TEMPLATES.map((t) => JSON.parse(JSON.stringify(t))));
  });

  describe('progress history', () => {
    it('Pro only; counts completed tasks and checks by week; another user gets NOT_FOUND', async () => {
      const { user, goal } = await userWithGoal();
      expect(await code(as(c, { sub: user }, (tx) => tx.query(`select * from public.goal_history($1, 4)`, [goal])))).toBe('HG402');
      await grantPro(user);
      const task = (await c.query<{ id: string }>(`select id from actions where goal_id = $1 and kind = 'task'`, [goal])).rows[0]!.id;
      const routine = (await c.query<{ id: string }>(`select id from actions where goal_id = $1 and kind = 'routine'`, [goal])).rows[0]!.id;
      await call(c, { sub: user }, 'complete_action', { actionId: task });
      await call(c, { sub: user }, 'check_routine', { actionId: routine, date: today });
      const rows = await as(c, { sub: user }, async (tx) => (await tx.query<Record<string, unknown>>(`select * from public.goal_history($1, 4)`, [goal])).rows);
      expect(rows).toHaveLength(4);
      expect(rows[3]).toMatchObject({ tasks_completed: 1, routine_checks: 1 });
      expect(rows.slice(0, 3).every((r) => r.tasks_completed === 0)).toBe(true);
      const other = await t.createUser();
      await grantPro(other);
      expect(await code(as(c, { sub: other }, (tx) => tx.query(`select * from public.goal_history($1, 4)`, [goal])))).toBe('HG404');
    });
  });

  describe('30-day challenge', () => {
    it('requires Pro; join needs a commitment and an active own goal; a double tap is idempotent; a second challenge is refused', async () => {
      const { user, goal } = await userWithGoal();
      const id = uuid();
      // Free users cannot enroll in a challenge.
      expect(await code(call(c, { sub: user }, 'join_challenge', { id, goalId: goal, committed: true }))).toBe('HG402');
      await grantPro(user);
      expect(await code(call(c, { sub: user }, 'join_challenge', { id, goalId: goal }))).toBe('HG400');
      const e1 = await call<{ id: string; start_date: string; end_date: string; status: string }>(c, { sub: user }, 'join_challenge', { id, goalId: goal, committed: true });
      const e2 = await call<{ id: string }>(c, { sub: user }, 'join_challenge', { id, goalId: goal, committed: true });
      expect(e2.id).toBe(e1.id);
      expect(e1.start_date).toBe(today);
      expect(e1.status).toBe('active');
      expect(await code(call(c, { sub: user }, 'join_challenge', { id: uuid(), goalId: goal, committed: true }))).toBe('HG409');
      expect((await c.query(`select 1 from challenge_enrollments where user_id = $1`, [user])).rows).toHaveLength(1);

      const other = await userWithGoal();
      await grantPro(other.user);
      expect(await code(call(c, { sub: other.user }, 'join_challenge', { id: uuid(), goalId: goal, committed: true }))).toBe('HG404');
      const draft = await userWithGoal(false);
      await grantPro(draft.user);
      expect(await code(call(c, { sub: draft.user }, 'join_challenge', { id: uuid(), goalId: draft.goal, committed: true }))).toBe('HG422');
    });

    it('the summary reflects stored activity only; completion waits for day 30; downgrade preserves enrollment and re-upgrade restores access', async () => {
      const { user, goal } = await userWithGoal();
      await grantPro(user);
      const id = uuid();
      await call(c, { sub: user }, 'join_challenge', { id, goalId: goal, committed: true });
      let s = await call<Record<string, unknown>>(c, { sub: user }, 'challenge_summary', id);
      expect(s).toMatchObject({ day: 1, daysRemaining: 29, activeDays: 0, tasksCompleted: 0 });
      const task = (await c.query<{ id: string }>(`select id from actions where goal_id = $1 and kind = 'task'`, [goal])).rows[0]!.id;
      await call(c, { sub: user }, 'complete_action', { actionId: task });
      await call(c, { sub: user }, 'add_reflection', { goalId: goal, date: today, kind: 'weekly', didntGoWell: 'Busy week' });
      s = await call<Record<string, unknown>>(c, { sub: user }, 'challenge_summary', id);
      expect(s).toMatchObject({ day: 1, activeDays: 1, tasksCompleted: 1, weeklyReviews: [{ week: 1, done: true }] });
      expect((s.milestones as { title: string }[]).map((m) => m.title)).toEqual(['Task one']);
      expect(await code(call(c, { sub: user }, 'complete_challenge', { enrollmentId: id }))).toBe('HG422');
      const other = await t.createUser();
      await grantPro(other);
      expect(await code(call(c, { sub: other }, 'challenge_summary', id))).toBe('HG404');

      // Downgrade: enrollment and progress remain intact, but challenge endpoints and selects are gated.
      await c.query(`delete from plan_grants where user_id = $1`, [user]);
      expect(await code(call(c, { sub: user }, 'challenge_summary', id))).toBe('HG402');
      expect(await code(call(c, { sub: user }, 'complete_challenge', { enrollmentId: id }))).toBe('HG402');
      expect(await code(call(c, { sub: user }, 'leave_challenge', { enrollmentId: id }))).toBe('HG402');
      expect(await code(call(c, { sub: user }, 'preview_share_card', { goalId: goal, kind: 'challenge', show: { stats: true } }))).toBe('HG402');
      const freeEnrollments = await as(c, { sub: user }, async (tx) => (await tx.query(`select * from public.challenge_enrollments`)).rows);
      expect(freeEnrollments).toEqual([]);
      expect((await c.query(`select 1 from challenge_enrollments where id = $1`, [id])).rows).toHaveLength(1);

      // Re-upgrade restores full access to the existing enrollment and progress.
      await grantPro(user);
      const proEnrollments = await as(c, { sub: user }, async (tx) => (await tx.query(`select * from public.challenge_enrollments`)).rows);
      expect(proEnrollments).toHaveLength(1);

      // Day 30 reached (moved back in time): completion records the user's words.
      await c.query(`update challenge_enrollments set start_date = start_date - 29, end_date = end_date - 29 where id = $1`, [id]);
      const done = await call<{ status: string; accomplishments: string[]; final_reflection: string }>(c, { sub: user }, 'complete_challenge', {
        enrollmentId: id, finalReflection: 'Steadier than I expected', accomplishments: ['Finished task one', '  ', 'Wrote a review'],
      });
      expect(done).toMatchObject({ status: 'completed', accomplishments: ['Finished task one', 'Wrote a review'], final_reflection: 'Steadier than I expected' });

      const second = uuid();
      await call(c, { sub: user }, 'join_challenge', { id: second, goalId: goal, committed: true });
      expect(await call<{ status: string }>(c, { sub: user }, 'leave_challenge', { enrollmentId: second })).toMatchObject({ status: 'left' });
      expect(await code(as(c, { sub: user }, (tx) => tx.query(`update challenge_enrollments set status = 'completed'`)))).toBe('42501');
    });
  });

  describe('sharing', () => {
    it('cards contain only the selected fields, with numbers from the database', async () => {
      const { user, goal } = await userWithGoal();
      const bare = await call<Record<string, unknown>>(c, { sub: user }, 'preview_share_card', { goalId: goal, kind: 'progress', show: {} });
      expect(bare).toEqual({ kind: 'progress' });
      const full = await call<Record<string, unknown>>(c, { sub: user }, 'preview_share_card', {
        goalId: goal, kind: 'progress', show: { goalTitle: true, stats: true }, accomplishment: 'First week done', stats: { tasksDone: 999 },
      });
      expect(full).toEqual({
        kind: 'progress', goalTitle: 'Private goal title', accomplishment: 'First week done',
        stats: { tasksDone: 0, tasksTotal: 1, keyAreas: 1, actionsPlanned: 2 },
      });
      expect(JSON.stringify(full)).not.toMatch(/vision|Private vision|Area one|Task one/);
      const other = await t.createUser();
      expect(await code(call(c, { sub: other }, 'preview_share_card', { goalId: goal, kind: 'progress', show: {} }))).toBe('HG404');
    });

    it('a link is a random 64-hex token that anyone can read until it is revoked or expires', async () => {
      const { user, goal } = await userWithGoal();
      const l = await call<{ id: string; token: string }>(c, { sub: user }, 'create_share_link', { goalId: goal, kind: 'weekly', show: { stats: true }, lesson: 'Start earlier' });
      expect(l.token).toMatch(/^[a-f0-9]{64}$/);
      expect(l.token).not.toContain(goal.replace(/-/g, ''));
      const pub = await call<{ card: Record<string, unknown>; ref: string }>(c, 'anon', 'get_shared_card', l.token);
      expect(pub.card).toMatchObject({ kind: 'weekly', lesson: 'Start earlier' });
      expect(pub.card.goalTitle).toBeUndefined();
      expect(pub.ref).toMatch(/^[a-f0-9]{10}$/);
      expect(await call(c, 'anon', 'get_shared_card', 'f'.repeat(64))).toBeNull();
      expect(await call(c, 'anon', 'get_shared_card', goal)).toBeNull();

      const other = await t.createUser();
      expect(await code(call(c, { sub: other }, 'revoke_share_link', { id: l.id }))).toBe('HG404');
      await call(c, { sub: user }, 'revoke_share_link', { id: l.id });
      expect(await call(c, 'anon', 'get_shared_card', l.token)).toBeNull();

      const exp = await call<{ token: string }>(c, { sub: user }, 'create_share_link', { goalId: goal, kind: 'progress', show: {}, expiresInDays: 1 });
      await c.query(`update share_links set expires_at = now() - interval '1 second' where token = $1`, [exp.token]);
      expect(await call(c, 'anon', 'get_shared_card', exp.token)).toBeNull();

      expect(await code(as(c, 'anon', (tx) => tx.query(`select * from share_links`)))).toBe('42501');
      const theirs = await as(c, { sub: other }, async (tx) => (await tx.query(`select * from share_links`)).rows);
      expect(theirs).toEqual([]);
      expect(await code(as(c, { sub: user }, (tx) => tx.query(`update share_links set payload = '{}'`)))).toBe('42501');
    });

    it('anon cannot reach private data through the public function or tables', async () => {
      const { goal } = await userWithGoal();
      for (const sql of [`select * from goals`, `select * from reflections`, `select * from challenge_enrollments`, `select * from profiles`]) {
        expect(await code(as(c, 'anon', (tx) => tx.query(sql)))).toBe('42501');
      }
      expect(await code(call(c, 'anon', 'preview_share_card', { goalId: goal, kind: 'progress', show: { goalTitle: true } }))).toBe('42501');
    });
  });

  describe('referrals', () => {
    async function signUpWith(meta: Record<string, unknown>) {
      const id = uuid();
      await c.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${id}@example.test`, JSON.stringify(meta)]);
      return id;
    }

    it('attributes a sign-up once, to a valid code of someone else, and marks the first payment as a conversion', async () => {
      const referrer = await t.createUser();
      const codeOf = (await call<{ code: string }>(c, { sub: referrer }, 'get_my_referrals')).code;
      const friend = await signUpWith({ display_name: 'Friend', referral_code: codeOf });
      await signUpWith({ display_name: 'Junk', referral_code: "x'; drop table referrals; --" });
      await signUpWith({ display_name: 'Unknown', referral_code: '0000000000' });
      expect(await call(c, { sub: referrer }, 'get_my_referrals')).toMatchObject({ signups: 1, conversions: 0 });
      await call(c, 'service_role', 'billing_apply', stripeEvent({ customerId: 'cus_friend', subscriptionId: 'sub_friend', userId: friend }));
      expect(await call(c, { sub: referrer }, 'get_my_referrals')).toMatchObject({ signups: 1, conversions: 1 });
      expect(await code(as(c, { sub: referrer }, (tx) => tx.query(`select * from referrals`)))).toBe('42501');
    });
  });

  describe('analytics', () => {
    it('accepts known events with token-only properties and rejects free text, unknown keys and server-only names', async () => {
      const user = await t.createUser();
      await call(c, { sub: user }, 'track_event', 'goal_created', { platform: 'ios', count: 1 });
      expect(await code(call(c, { sub: user }, 'track_event', 'goal_created', { source: 'Run a marathon in May' }))).toBe('HG400');
      expect(await code(call(c, { sub: user }, 'track_event', 'goal_created', { title: 'x' }))).toBe('HG400');
      expect(await code(call(c, { sub: user }, 'track_event', 'subscription_activated', {}))).toBe('HG400');
      expect(await code(call(c, { sub: user }, 'track_event', 'made_up_event', {}))).toBeDefined();
      expect(await code(call(c, 'anon', 'track_event', 'landing_page_viewed', {}))).toBe('HG400');
      await call(c, 'anon', 'track_event', 'landing_page_viewed', { source: 'share' }, 'visitor-abc123');
      expect(await code(as(c, { sub: user }, (tx) => tx.query(`select * from analytics_events`)))).toBe('42501');
      const rows = (await c.query<{ props: unknown }>(`select props from analytics_events where name in ('goal_created','landing_page_viewed') order by id`)).rows;
      expect(rows.map((r) => r.props)).toEqual([{ platform: 'ios', count: 1 }, { source: 'share' }]);
    });
  });

  describe('admin metrics', () => {
    it('refuses non-admins and reports MRR from subscription state (annual / 12) for admins', async () => {
      const user = await t.createUser();
      expect(await code(call(c, { sub: user }, 'admin_metrics'))).toBe('HG403');
      expect(await call(c, { sub: user }, 'am_i_admin')).toBe(false);
      const yearly = await t.createUser();
      await call(c, 'service_role', 'billing_apply', stripeEvent({ customerId: `cus_${uuid()}`, subscriptionId: `sub_${uuid()}`, userId: yearly, stripePriceId: 'price_annual_test', amountCents: 4800, interval: 'year' }));
      await c.query(`insert into admins (user_id) values ($1)`, [user]);
      const m = await call<{ billing: { mrrCents: number; activeSubscriptions: number }; users: { total: number } }>(c, { sub: user }, 'admin_metrics');
      const expected = (await c.query<{ m: string }>(
        `select sum(case billing_interval when 'year' then amount_cents/12.0 else amount_cents end)::bigint m from subscriptions where status='active'`)).rows[0]!.m;
      expect(m.billing.mrrCents).toBe(Number(expected));
      expect(m.billing.activeSubscriptions).toBeGreaterThan(0);
      expect(m.users.total).toBeGreaterThan(1);
    });
  });
});
