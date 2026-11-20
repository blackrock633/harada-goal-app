import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import ProfileScreen from '@/app/community/u/[username]';

const mockSetParams = jest.fn();
const mockPush = jest.fn();
let mockParam = 'old_name';
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), setParams: (...a: unknown[]) => mockSetParams(...a) },
  useLocalSearchParams: () => ({ username: mockParam }),
}));

const mockProfileArg = jest.fn();
const me = {
  userId: 'u1', username: 'new_name', displayName: 'Noah', bio: 'Runner', location: '', website: '', avatarUrl: null,
  isPrivate: false, restricted: false, joinedAt: '', isOwnProfile: true, isFollowing: false, followsViewer: false,
  followersCount: 3, followingCount: 2, stats: null, publicGoals: [], ownGoals: [], recentPosts: [],
};
jest.mock('@/data/social', () => ({
  useSocialProfile: (who: string) => (mockProfileArg(who), { isPending: false, isError: false, data: me }),
  useUserPosts: () => ({ isPending: false, isError: false, data: { pages: [] }, hasNextPage: false }),
  useInvalidateSocial: () => jest.fn(),
  followUser: jest.fn(),
  unfollowUser: jest.fn(),
  blockUser: jest.fn(),
  usePostImage: () => ({}),
}));

it('your own profile opened by username switches to `me`, so a rename (with a photo) still reloads it', async () => {
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <ProfileScreen />
    </QueryClientProvider>,
  );
  expect(screen.getByText('Runner')).toBeOnTheScreen();
  expect(screen.getByLabelText('3 Followers')).toBeOnTheScreen();
  expect(mockSetParams).toHaveBeenCalledWith({ username: 'me' });

  mockSetParams.mockClear();
  mockParam = 'me';
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <ProfileScreen />
    </QueryClientProvider>,
  );
  expect(mockProfileArg).toHaveBeenLastCalledWith('me');
  expect(mockSetParams).not.toHaveBeenCalled();
});

it('Settings is reached from your own profile', async () => {
  mockParam = 'me';
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <ProfileScreen />
    </QueryClientProvider>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
  expect(mockPush).toHaveBeenCalledWith('/settings');
});
