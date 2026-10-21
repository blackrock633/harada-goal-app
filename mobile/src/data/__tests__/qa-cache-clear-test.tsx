// Contributed by QA (cross-account cache guard): query keys are not user-scoped, so clearing the
// cache on sign-out is the only thing preventing the next account from seeing the previous one's data.
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

let mockStatus: 'signedIn' | 'signedOut' = 'signedIn';
let mockUserId = 'alice';
jest.mock('@/auth/session', () => ({
  useSession: () => ({ status: mockStatus, session: { user: { id: mockUserId } } }),
}));

import { queryClient } from '../query-client';
import { QueryProvider } from '../query-provider';

// Leftover cache entries hold 5-minute GC timers that would keep Jest from exiting.
afterEach(() => queryClient.clear());

it("signing out clears every cached query (no previous account's goals for the next user)", async () => {
  const ui = () => (
    <QueryProvider>
      <Text>app</Text>
    </QueryProvider>
  );
  const view = await render(ui());
  queryClient.setQueryData(['today'], { goals: [{ title: "Alice's secret goal" }] });
  queryClient.setQueryData(['goal', 'g1'], { title: "Alice's secret goal" });
  expect(queryClient.getQueryCache().getAll()).toHaveLength(2);
  mockStatus = 'signedOut';
  await view.rerender(ui());
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
});

it('switching accounts without a sign-out also clears the cache', async () => {
  mockStatus = 'signedIn';
  mockUserId = 'alice';
  const ui = () => (
    <QueryProvider>
      <Text>app</Text>
    </QueryProvider>
  );
  const view = await render(ui());
  queryClient.setQueryData(['today'], { goals: [{ title: "Alice's secret goal" }] });
  mockUserId = 'bob';
  await view.rerender(ui());
  expect(queryClient.getQueryData(['today'])).toBeUndefined();
});

it('keeps the cache across re-renders for the same user', async () => {
  mockStatus = 'signedIn';
  mockUserId = 'carol';
  const ui = () => (
    <QueryProvider>
      <Text>app</Text>
    </QueryProvider>
  );
  const view = await render(ui());
  queryClient.setQueryData(['today'], { goals: [] });
  await view.rerender(ui());
  expect(queryClient.getQueryData(['today'])).toEqual({ goals: [] });
});
