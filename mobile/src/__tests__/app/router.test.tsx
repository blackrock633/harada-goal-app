import { renderRouter, screen, testRouter, waitFor } from 'expo-router/testing-library';

import { queryClient } from '@/data/query-client';
import { createFakeSupabase } from '@/data/test-support/fake-supabase';
import { database } from '@/data/test-support/fixtures';

const APP = './src/app';

// The session decides which route groups exist (Stack.Protected). Drive it directly.
let mockSession: { status: string; session?: unknown } = { status: 'signedIn', session: {} };
jest.mock('@/auth/session', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => mockSession,
}));

let mockClient: unknown;
jest.mock('@/data/supabase', () => ({
  ...jest.requireActual('@/data/supabase'),
  getSupabase: () => mockClient,
}));

beforeEach(() => {
  mockSession = { status: 'signedIn', session: {} };
  mockClient = createFakeSupabase({ ...database(), goals: [], outcomes: [], actions: [] }).client;
});

// Leftover TanStack cache entries hold GC timers that keep Jest from exiting.
afterEach(() => queryClient.clear());

describe('app routes (signed in)', () => {
  it.each([
    ['/today', 'Start with one goal'],
    ['/matrix', 'The matrix is empty'],
    ['/review', 'Nothing to review yet'],
  ])('renders %s with no goals', async (url, copy) => {
    await renderRouter(APP, { initialUrl: url });
    expect((await screen.findAllByText(copy))[0]).toBeOnTheScreen();
    expect(screen).toHavePathname(url);
    expect(screen.getAllByRole('button', { name: 'Account menu' }).length).toBeGreaterThan(0);
  });

  it('redirects / to Today', async () => {
    await renderRouter(APP, { initialUrl: '/' });
    expect(screen).toHavePathname('/today');
  });

  it('renders the four tabs in order', async () => {
    const { getRouterState } = await renderRouter(APP, { initialUrl: '/today' });
    // Native tabs are rendered by the platform; verify the layout registers all four routes in order.
    const root = getRouterState()?.routes[0]?.state;
    const tabs = root?.routes.find((r: { name: string }) => r.name === '(tabs)')?.state;
    expect(tabs?.routeNames).toEqual(['today', 'goal', 'matrix', 'review']);
  });

  it('renders the auth screens with the real form layout', async () => {
    mockSession = { status: 'signedOut' };
    await renderRouter(APP, { initialUrl: '/signin' });
    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
    expect(screen.getByLabelText('Password')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
    await testRouter.push('/signup');
    expect(screen).toHavePathname('/signup');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeOnTheScreen();
  });

  it('sends a user with no goals from My Goal to onboarding', async () => {
    await renderRouter(APP, { initialUrl: '/goal' });
    await waitFor(() => expect(screen).toHavePathname('/goal/new'));
  });

  it('opens a key-area detail route (empty state without goals)', async () => {
    await renderRouter(APP, { initialUrl: '/matrix/3' });
    expect(screen).toHavePathname('/matrix/3');
    expect(await screen.findByText('No goal yet')).toBeOnTheScreen();
  });

  it('rejects an out-of-range key area', async () => {
    await renderRouter(APP, { initialUrl: '/matrix/9' });
    expect(screen.getByText('Key area not found')).toBeOnTheScreen();
  });

  it('opens settings from the account menu with a Sign out button', async () => {
    await renderRouter(APP, { initialUrl: '/today' });
    await testRouter.push('/settings');
    expect(screen).toHavePathname('/settings');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeOnTheScreen();
  });
});

describe('session gating', () => {
  it('keeps signed-out users out of the tabs', async () => {
    mockSession = { status: 'signedOut' };
    await renderRouter(APP, { initialUrl: '/today' });
    expect(screen).not.toHavePathname('/today');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
  });

  it('sends signed-out users from / to sign in', async () => {
    mockSession = { status: 'signedOut' };
    await renderRouter(APP, { initialUrl: '/' });
    expect(screen).toHavePathname('/signin');
  });

  it('keeps signed-in users out of the auth screens', async () => {
    await renderRouter(APP, { initialUrl: '/signin' });
    expect(screen).not.toHavePathname('/signin');
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('shows a configuration error instead of running without auth', async () => {
    mockSession = { status: 'misconfigured' };
    await renderRouter(APP, { initialUrl: '/' });
    expect(screen.getByText("Harada isn't configured")).toBeOnTheScreen();
  });
});
