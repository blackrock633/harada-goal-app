import crypto from 'node:crypto';
import { cleanup } from '@testing-library/react-native';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { queryClient } from '@/data/query-client';
import { createPgliteSupabase, type PgliteSupabase } from '@/data/test-support/pglite-supabase';
// The real-DB harness lives in the repo root (src/infrastructure); PGlite is not a mobile dependency.
import { createTestDeps, type TestDeps } from '../../../src/infrastructure/testing/create-test-deps';

const APP = './src/app';
jest.setTimeout(60_000);

let mockSession: { status: string; session?: unknown } = { status: 'signedIn', session: { user: { id: 'u', email: 'x@example.com' } } };
jest.mock('@/auth/session', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => mockSession,
}));

let mockClient: unknown;
jest.mock('@/data/supabase', () => ({
  ...jest.requireActual('@/data/supabase'),
  getSupabase: () => mockClient,
}));
jest.mock('@/data/auth', () => ({ signIn: jest.fn(), signUp: jest.fn(), signOut: jest.fn() }));

let t: TestDeps;
let pg: PgliteSupabase;
const uuid = () => crypto.randomUUID();

/** PGlite's emscripten loader branches on `typeof window` (jest-expo defines one), so hide it while booting. */
async function bootDb() {
  const g = globalThis as { window?: unknown };
  const w = g.window;
  delete g.window;
  try {
    t = await createTestDeps();
    await t.client.waitReady;
  } finally {
    g.window = w;
  }
}

const defaults = queryClient.getDefaultOptions();
beforeAll(bootDb, 120_000);
afterAll(async () => t?.close());
beforeEach(() => {
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });
});
afterEach(() => {
  queryClient.clear();
  queryClient.setDefaultOptions(defaults);
});

async function newUser(name: string) {
  const id = await t.createUser({ displayName: name });
  pg = createPgliteSupabase(t.client, id);
  mockClient = { from: pg.from, rpc: pg.rpc, functions: { invoke: jest.fn() } };
  return id;
}

type Rendered = Awaited<ReturnType<typeof renderRouter>>;
let current: Rendered | null = null;
/** expo-router mounts all four tabs at once; scope queries to the tab that owns the URL. */
let currentTab = 'today';
function ui() {
  const prefix = `expo-router-tab:${currentTab}:`;
  const host = (current as any).container.queryAll((n) => String(n.props?.nativeID ?? '').startsWith(prefix))[0];
  if (!host) {
    const all = (current as any).container.queryAll((n) => JSON.stringify(n.props ?? {}, (k, v) => (typeof v === 'function' ? undefined : v)).includes('expo-router-tab'));
    throw new Error(`tab ${currentTab} not mounted; candidates: ` + all.map((n) => n.type + ':' + Object.keys(n.props).join(',')).join(' ; '));
  }
  return within(host);
}
async function open(url: string) {
  currentTab = url.split(/[/?]/)[1] || 'today';
  current = await renderRouter(APP, { initialUrl: url });
  await act(async () => {});
  await waitFor(() => void ui());
  return current;
}
/** "Reopen the app": unmount everything, drop the query cache, render from scratch. */
async function reopen(url: string) {
  await cleanup();
  current = null;
  queryClient.clear();
  return open(url);
}
afterEach(() => {
  current = null;
});

/** Wait until every query has finished and stayed finished across a few render ticks (fake timers are on). */
async function settle() {
  for (let i = 0; i < 6; i++) {
    await waitFor(() => {
      expect(screen.queryAllByLabelText('Loading')).toHaveLength(0);
      expect(queryClient.isFetching()).toBe(0);
    });
    await act(async () => {});
  }
}

function dump(): string {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n == null) return;
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return n.forEach(walk);
    const l = n.props?.accessibilityLabel;
    if (l) out.push(`[${l}]`);
    (n.children ?? []).forEach(walk);
  };
  walk(screen.toJSON());
  return out.join(' | ');
}

const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await t.client.query<T>(sql, params)).rows;
const count = async (table: string, where: string, params: unknown[]) =>
  Number((await rows<{ n: number }>(`select count(*)::int n from ${table} where ${where}`, params))[0]!.n);

/** Seed through the app's real RPCs, as the acting user. */
async function rpc<T = Record<string, any>>(name: string, input: unknown): Promise<T> {
  const r = await pg.rpc(name, { p_input: input });
  if (r.error) throw new Error(`${name}: ${r.error.code} ${r.error.message}`);
  return r.data as T;
}
async function seedGoal(title: string, tasks: string[] = [], outcomeTitle = 'Area one') {
  const goal = await rpc('create_goal', { id: uuid(), title });
  const outcome = await rpc('add_outcome', { id: uuid(), goalId: goal.id, position: 0, title: outcomeTitle });
  const actions: Record<string, any>[] = [];
  for (const [i, a] of tasks.entries()) {
    actions.push(await rpc('add_action', { id: uuid(), outcomeId: outcome.id, position: i, title: a, kind: 'task' }));
  }
  return { goal, outcome, actions };
}

describe('QA journeys (real screens, real Postgres)', () => {
  it('J1 create goal via goal/new, persists after reopening the app', async () => {
    const uid = await newUser('Ada');
    await open('/goal/new');
    await fireEvent.changeText(await ui().findByLabelText('Your goal'), 'Run a marathon');
    await fireEvent.press(ui().getByRole('button', { name: 'Create goal' }));
    expect(await ui().findByText('Make it yours (optional)')).toBeOnTheScreen();
    await fireEvent.changeText(
      ui().getByLabelText("How you'll know you've succeeded (optional)"),
      'Finish 42.2 km in under 4:30 on race day',
    );
    await fireEvent.press(ui().getByRole('button', { name: 'Save and continue' }));
    expect(await ui().findByText('Your goal is created')).toBeOnTheScreen();
    expect(ui().getByText('Run a marathon')).toBeOnTheScreen();

    expect(await rows('select title, success_criteria, status from goals where owner_id=$1', [uid])).toEqual([
      { title: 'Run a marathon', success_criteria: 'Finish 42.2 km in under 4:30 on race day', status: 'draft' },
    ]);

    await reopen('/goal');
    expect(await ui().findByText('Run a marathon')).toBeOnTheScreen();
    expect(ui().getByText('Finish 42.2 km in under 4:30 on race day')).toBeOnTheScreen();
    expect(ui().getByText('Draft')).toBeOnTheScreen();
  });

  it('J2 matrix: 2 key areas + 3 actions persist; plan 5 of 72; positions as chosen', async () => {
    const uid = await newUser('Bo');
    const { goal } = { goal: await rpc('create_goal', { id: uuid(), title: 'Get fit' }) };

    // Key area 1 (position 0) and its actions at slots 1 and 3.
    await open(`/matrix/0?goal=${goal.id}`);
    await fireEvent.press(await ui().findByRole('button', { name: 'Add key area 1' }));
    await fireEvent.changeText(ui().getByLabelText('Key area title'), 'Fitness');
    await fireEvent.press(ui().getByRole('button', { name: 'Create key area' }));
    expect(await ui().findByRole('button', { name: 'Add action 1 of 8' })).toBeOnTheScreen();

    await fireEvent.press(ui().getByRole('button', { name: 'Add action 1 of 8' }));
    await fireEvent.changeText(ui().getByLabelText('Title'), 'Run 5k');
    await fireEvent.press(ui().getByRole('button', { name: 'Add action' }));
    expect(await ui().findByLabelText('Complete: Run 5k')).toBeOnTheScreen();

    await fireEvent.press(ui().getByRole('button', { name: 'Add action 3 of 8' }));
    await fireEvent.changeText(ui().getByLabelText('Title'), 'Buy shoes');
    await fireEvent.press(ui().getByRole('button', { name: 'Add action' }));
    expect(await ui().findByLabelText('Complete: Buy shoes')).toBeOnTheScreen();

    // Key area 2 (position 1) with one action.
    await fireEvent.press(ui().getByRole('button', { name: 'Next key area (2)' }));
    await fireEvent.press(await ui().findByRole('button', { name: 'Add key area 2' }));
    await fireEvent.changeText(ui().getByLabelText('Key area title'), 'Nutrition');
    await fireEvent.press(ui().getByRole('button', { name: 'Create key area' }));
    await fireEvent.press(await ui().findByRole('button', { name: 'Add action 1 of 8' }));
    await fireEvent.changeText(ui().getByLabelText('Title'), 'Meal prep');
    await fireEvent.press(ui().getByRole('button', { name: 'Add action' }));
    expect(await ui().findByLabelText('Complete: Meal prep')).toBeOnTheScreen();

    // DB truth.
    expect(await rows('select title, position from outcomes where goal_id=$1 order by position', [goal.id])).toEqual([
      { title: 'Fitness', position: 0 },
      { title: 'Nutrition', position: 1 },
    ]);
    expect(
      await rows(
        'select a.title, a.position, o.title as area from actions a join outcomes o on o.id=a.outcome_id where a.goal_id=$1 order by o.position, a.position',
        [goal.id],
      ),
    ).toEqual([
      { title: 'Run 5k', position: 0, area: 'Fitness' },
      { title: 'Buy shoes', position: 2, area: 'Fitness' },
      { title: 'Meal prep', position: 0, area: 'Nutrition' },
    ]);
    expect(await count('outcomes', 'goal_id=$1', [goal.id])).toBe(2);
    expect(await count('actions', 'goal_id=$1', [goal.id])).toBe(3);
    expect(await count('goals', 'owner_id=$1', [uid])).toBe(1);

    // Reopen: matrix overview and goal screen.
    await reopen(`/matrix?goal=${goal.id}`);
    expect(await ui().findByText('Plan: 5 of 72 positions filled')).toBeOnTheScreen();
    expect(ui().getByText('2 of 8 key areas · 3 of 64 actions')).toBeOnTheScreen();
    expect(ui().getByText('Fitness')).toBeOnTheScreen();
    expect(ui().getByText('Nutrition')).toBeOnTheScreen();

    await reopen(`/matrix/0?goal=${goal.id}`);
    expect(await ui().findByLabelText('Complete: Run 5k')).toBeOnTheScreen();
    expect(ui().getByLabelText('Complete: Buy shoes')).toBeOnTheScreen();
    expect(ui().getByTestId('slot-0-2')).toHaveTextContent(/Buy shoes/);

    await reopen(`/goal?goal=${goal.id}`);
    expect(await ui().findByText('5 of 72 positions filled')).toBeOnTheScreen();
    expect(ui().getByText('1. Fitness')).toBeOnTheScreen();
    expect(ui().getByText('2. Nutrition')).toBeOnTheScreen();
  });

  it('J3 Today: activate, add to today, complete, persists; reopen persists', async () => {
    await newUser('Cy');
    const { goal, actions } = await seedGoal('Learn piano', ['Practice scales']);
    const actionId = actions[0]!.id;

    await open(`/goal?goal=${goal.id}`);
    await fireEvent.press(await ui().findByRole('button', { name: 'Activate goal' }));
    expect(await ui().findByText('Active')).toBeOnTheScreen();
    expect((await rows('select status from goals where id=$1', [goal.id]))[0]!.status).toBe('active');

    await reopen('/today');
    await fireEvent.press(await ui().findByLabelText('Add to today: Practice scales'));
    expect(await ui().findByLabelText('Remove from today: Practice scales')).toBeOnTheScreen();
    expect(await count('daily_focus', 'action_id=$1', [actionId])).toBe(1);

    await fireEvent.press(ui().getByLabelText('Complete: Practice scales'));
    expect(await ui().findByLabelText('Reopen: Practice scales')).toBeOnTheScreen();
    await waitFor(async () => expect(await count('actions', 'id=$1 and completed_at is not null', [actionId])).toBe(1));

    await reopen('/today');
    expect(await ui().findByLabelText('Reopen: Practice scales')).toBeOnTheScreen();
    expect(ui().getByText('1 of 1 done today')).toBeOnTheScreen();

    await fireEvent.press(ui().getByLabelText('Reopen: Practice scales'));
    expect(await ui().findByLabelText('Complete: Practice scales')).toBeOnTheScreen();
    await waitFor(async () => expect(await count('actions', 'id=$1 and completed_at is null', [actionId])).toBe(1));

    await reopen('/today');
    expect(await ui().findByLabelText('Complete: Practice scales')).toBeOnTheScreen();
    expect(ui().queryByLabelText('Reopen: Practice scales')).toBeNull();
  });

  it('J4 metrics: 2 of 3 tasks done, attainment not measured, no 100%/Achieved', async () => {
    await newUser('Di');
    const { goal, actions } = await seedGoal('Ship v1', ['Design', 'Build', 'Launch']);
    await rpc('complete_action', { actionId: actions[0]!.id });
    await rpc('complete_action', { actionId: actions[1]!.id });

    await open(`/goal?goal=${goal.id}`);
    expect(await ui().findByText('2 of 3 tasks done')).toBeOnTheScreen();
    expect(ui().getByText('Not measured yet')).toBeOnTheScreen();
    expect(ui().queryByText(/100\s*%/)).toBeNull();
    expect(ui().queryByText(/%/)).toBeNull();
    expect(ui().queryByText('Achieved')).toBeNull();
    expect(ui().queryByText(/Measured attainment/)).toBeNull();

    await reopen(`/matrix?goal=${goal.id}`);
    expect(await ui().findByText('Actions: 2 of 3 done')).toBeOnTheScreen();
    expect(ui().queryByText(/%/)).toBeNull();
  });

  it('J5 isolation: user B never sees user A data', async () => {
    const A = await newUser('Alice');
    const secret = 'Alice secret goal ZZ91';
    const { goal } = await seedGoal(secret, ['Alice secret task ZZ91'], 'Alice secret area ZZ91');
    await rpc('activate_goal', { goalId: goal.id });

    // Sanity: A sees it.
    await open('/goal');
    expect(await ui().findByText(secret)).toBeOnTheScreen();

    // Sign in as B (fresh account) on the same device: new session, empty cache.
    await cleanup();
    current = null;
    queryClient.clear();
    const B = await t.createUser({ displayName: 'Bob' });
    pg.actAs(B);
    expect(pg.userId).not.toBe(A);

    for (const url of ['/today', '/goal', '/matrix', '/review', `/goal?goal=${goal.id}`, `/matrix/0?goal=${goal.id}`, `/review?goal=${goal.id}`]) {
      await reopen(url);
      // wait for the screen to settle on something other than the loader
      await settle();
      expect(screen.queryByText(/Alice secret/)).toBeNull();
      expect(screen.queryByLabelText(/Alice secret/)).toBeNull();
    }
    // B's goal screen is the "no goal" onboarding, not A's goal.
    await reopen(`/goal?goal=${goal.id}`);
    expect(await ui().findByText('What do you want to achieve?')).toBeOnTheScreen();

    // The database agrees: RLS hides the rows and the write path refuses them.
    const read = await (pg.from('goals').select('id,title') as unknown as PromiseLike<{ data: unknown[] }>);
    expect(read.data).toEqual([]);
    const upd = await pg.rpc('update_goal', { p_input: { goalId: goal.id, title: 'pwned' } });
    expect(upd.error).not.toBeNull();
    expect((await rows('select title from goals where id=$1', [goal.id]))[0]!.title).toBe(secret);
    expect(await count('goals', 'owner_id=$1', [B])).toBe(0);
  });

  it('J6 lost response: first create executes but errors in the app; retry yields ONE row', async () => {
    const uid = await newUser('Eve');
    let first = true;
    pg.afterRpc = (name) => {
      if (name === 'create_goal' && first) {
        first = false;
        // What supabase-js returns on a dropped connection: error with status 0, no throw.
        return { data: null, error: { code: '', message: 'TypeError: Network request failed', details: null, hint: null }, status: 0 };
      }
      return undefined;
    };
    await open('/goal/new');
    await fireEvent.changeText(await ui().findByLabelText('Your goal'), 'Write a book');
    await fireEvent.press(ui().getByRole('button', { name: 'Create goal' }));
    expect(await ui().findByText(/Couldn't reach the server/)).toBeOnTheScreen();
    // The first create DID commit.
    expect(await count('goals', 'owner_id=$1', [uid])).toBe(1);
    expect(ui().getByDisplayValue('Write a book')).toBeOnTheScreen();

    await fireEvent.press(ui().getByRole('button', { name: 'Create goal' }));
    expect(await ui().findByText('Make it yours (optional)')).toBeOnTheScreen();

    expect(await count('goals', 'owner_id=$1', [uid])).toBe(1);
    const creates = pg.rpcLog.filter((c) => c.name === 'create_goal');
    expect(creates).toHaveLength(2);
    expect((creates[0]!.input as { id: string }).id).toBe((creates[1]!.input as { id: string }).id);

    await reopen('/goal');
    expect(await ui().findByText('Write a book')).toBeOnTheScreen();
    expect(await count('goals', 'owner_id=$1', [uid])).toBe(1);
  });
});
