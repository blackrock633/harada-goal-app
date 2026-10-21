import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { queryClient } from '@/data/query-client';
import { createFakeSupabase } from '@/data/test-support/fake-supabase';
import { database, goalRow, ID } from '@/data/test-support/fixtures';

const APP = './src/app';

const SIGNED_IN = { status: 'signedIn', session: { user: { id: 'u', email: 'ada@example.com' } } };
let mockSession: { status: string; session?: unknown } = SIGNED_IN;
jest.mock('@/auth/session', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => mockSession,
}));

let mockClient: unknown;
jest.mock('@/data/supabase', () => ({
  ...jest.requireActual('@/data/supabase'),
  getSupabase: () => mockClient,
}));

const mockSignOut = jest.fn(async () => ({ ok: true, data: null }));
const mockSignIn = jest.fn();
jest.mock('@/data/auth', () => ({
  signIn: (...a: unknown[]) => mockSignIn(...a),
  signUp: jest.fn(),
  signOut: () => mockSignOut(),
}));

const invoke = jest.fn();

function useDb() {
  const fake = createFakeSupabase(database());
  mockClient = { from: (fake.client as unknown as { from: unknown }).from, rpc: fake.rpc, functions: { invoke } };
  return fake;
}

const defaults = queryClient.getDefaultOptions();
beforeEach(() => {
  mockSession = SIGNED_IN;
  mockSignOut.mockClear();
  mockSignIn.mockReset();
  invoke.mockReset();
  // No retry backoff in tests: a failed read reaches ErrorState immediately.
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });
  useDb();
});
// Leftover TanStack cache entries hold GC timers that keep Jest from exiting.
afterEach(() => {
  queryClient.clear();
  queryClient.setDefaultOptions(defaults);
});

describe('Today', () => {
  it('renders rows from the signed-in user data', async () => {
    await renderRouter(APP, { initialUrl: '/today' });
    expect(await screen.findByText('Buy shoes')).toBeOnTheScreen();
  });

  it('shows ErrorState and retries a failed read', async () => {
    useDb().failTable('actions', { code: '42501', message: 'nope' });
    await renderRouter(APP, { initialUrl: '/today' });
    expect((await screen.findAllByText('Something went wrong'))[0]).toBeOnTheScreen();
    useDb(); // heal the backend, then retry
    await fireEvent.press(screen.getAllByRole('button', { name: 'Try again' })[0]!);
    expect(await screen.findByText('Buy shoes')).toBeOnTheScreen();
  });
});

describe('Matrix', () => {
  it('renders the 8 key area tiles for the focused goal', async () => {
    await renderRouter(APP, { initialUrl: '/matrix' });
    expect((await screen.findAllByLabelText('Goal: Run a marathon'))[0]).toBeOnTheScreen();
    expect(screen.getAllByText(/^Key area \d$/)).toHaveLength(8);
  });

  it('key-area route renders the key area and its 8 action slots', async () => {
    await renderRouter(APP, { initialUrl: `/matrix/0?goal=${ID.goalActive}` });
    expect(await screen.findByText('Key area 1 of 8')).toBeOnTheScreen();
    for (let i = 0; i < 8; i++) expect(screen.getByTestId(`slot-0-${i}`)).toBeOnTheScreen();
  });
});

describe('goal edit (DATA-01 regression on the real screen)', () => {
  it('editing one purpose quadrant keeps the other three intact in what is saved', async () => {
    const fake = createFakeSupabase(database(), {
      update_goal: { data: goalRow({ id: ID.goalActive, purpose_self_tangible: 'A new flat' }), error: null, status: 200 },
    });
    mockClient = { from: (fake.client as unknown as { from: unknown }).from, rpc: fake.rpc, functions: { invoke } };
    await renderRouter(APP, { initialUrl: `/goal/edit?goal=${ID.goalActive}` });
    const field = await screen.findByLabelText('For me, something concrete');
    await fireEvent.changeText(field, 'A new flat');
    await fireEvent.press(screen.getByRole('button', { name: 'Save goal' }));
    await waitFor(() => expect(fake.rpc).toHaveBeenCalledWith('update_goal', expect.anything()));
    const [, args] = fake.rpc.mock.calls.find(([name]) => name === 'update_goal')!;
    expect((args as { p_input: { purpose: unknown } }).p_input.purpose).toEqual({
      selfTangible: 'A new flat',
      selfIntangible: 'b',
      othersTangible: 'c',
      othersIntangible: 'd',
    });
  });
});

describe('sign in', () => {
  beforeEach(() => {
    mockSession = { status: 'signedOut' };
  });

  it('calls signIn with the entered values, shows a mapped error, keeps input', async () => {
    mockSignIn.mockResolvedValue({ ok: false, error: { code: 'VALIDATION', message: 'Email or password is incorrect' } });
    await renderRouter(APP, { initialUrl: '/signin' });
    await fireEvent.changeText(screen.getByLabelText('Email'), 'ada@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'hunter22');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email or password is incorrect')).toBeOnTheScreen();
    expect(mockSignIn).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'hunter22' });
    expect(screen.getByLabelText('Email').props.value).toBe('ada@example.com');
    expect(screen.getByLabelText('Password').props.value).toBe('hunter22');
  });

  it('shows field errors under the fields', async () => {
    mockSignIn.mockResolvedValue({
      ok: false,
      error: { code: 'VALIDATION', message: 'Check the highlighted fields.', fieldErrors: { email: ['Enter a valid email'] } },
    });
    await renderRouter(APP, { initialUrl: '/signin' });
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email')).toBeOnTheScreen();
  });
});

describe('settings', () => {
  it('Sign out calls signOut', async () => {
    await renderRouter(APP, { initialUrl: '/settings' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });

  it('Delete account requires typing DELETE and does not call the function otherwise', async () => {
    await renderRouter(APP, { initialUrl: '/settings' });
    await fireEvent.changeText(await screen.findByLabelText('Password'), 'pw');
    await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'delete');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    await waitFor(() => expect(screen.getAllByText('Type DELETE to confirm').length).toBe(2));
    expect(invoke).not.toHaveBeenCalled();
  });

  it('invokes delete-account, then signs out on success', async () => {
    invoke.mockResolvedValue({ data: { ok: true, data: null }, error: null });
    await renderRouter(APP, { initialUrl: '/settings' });
    await fireEvent.changeText(await screen.findByLabelText('Password'), 'pw');
    await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith('delete-account', { body: { password: 'pw', confirmation: 'DELETE' } });
  });

  it('shows the function error and stays signed in', async () => {
    const body = { ok: false, error: { code: 'VALIDATION', message: 'Password is incorrect', fieldErrors: { password: ['Password is incorrect'] } } };
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify(body), { status: 400 }) } });
    await renderRouter(APP, { initialUrl: '/settings' });
    await fireEvent.changeText(await screen.findByLabelText('Password'), 'bad');
    await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    expect(await screen.findByText('Password is incorrect')).toBeOnTheScreen();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
