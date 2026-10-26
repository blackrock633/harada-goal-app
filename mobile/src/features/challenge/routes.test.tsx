import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { queryClient } from '@/data/query-client';
import { createFakeSupabase } from '@/data/test-support/fake-supabase';
import { database } from '@/data/test-support/fixtures';

const APP = './src/app';

jest.mock('@/auth/session', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => ({ status: 'signedIn', session: { user: { id: 'u', email: 'ada@example.com' } } }),
}));

let mockClient: unknown;
jest.mock('@/data/supabase', () => ({
  ...jest.requireActual('@/data/supabase'),
  getSupabase: () => mockClient,
}));

const defaults = queryClient.getDefaultOptions();
beforeEach(() => {
  const fake = createFakeSupabase(database());
  mockClient = { from: (fake.client as unknown as { from: unknown }).from, rpc: fake.rpc, functions: { invoke: jest.fn() } };
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });
});
afterEach(() => {
  queryClient.clear();
  queryClient.setDefaultOptions(defaults);
});

describe('challenge routes', () => {
  it('Today links to the challenge, which shows the landing when none is running', async () => {
    await renderRouter(APP, { initialUrl: '/today' });
    const entry = await screen.findByRole('link', { name: 'Try the 30-Day Challenge' });
    await fireEvent.press(entry);
    expect(await screen.findByText('30 days, one goal')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Start the challenge' })).toBeOnTheScreen();
  });

  it('the share modal opens with everything hidden', async () => {
    await renderRouter(APP, { initialUrl: '/share?goalId=g1&kind=weekly' });
    expect(await screen.findByText('This week card')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Goal title' })).not.toBeChecked();
    expect(screen.getByLabelText("Next week's priority")).toBeOnTheScreen();
  });
});
