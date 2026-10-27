// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DiscoverResultDTO,
  SocialFeedDTO,
  SocialNotificationsListDTO,
  SocialPostDTO,
  SocialProfileDTO,
} from '@/application/social';
import { Avatar } from './Avatar';
import { CommunityHub } from './CommunityHub';
import { PostCard, type PostCardActions } from './PostCard';
import { PostComposer } from './PostComposer';
import { ProfileView } from './ProfileView';

vi.mock('@/app/actions/social', () => ({
  getSocialProfileAction: vi.fn(),
  updateSocialProfileAction: vi.fn(async (input: Record<string, unknown>) => ({
    ok: true,
    data: {
      ...makeProfile(),
      displayName: (input.displayName as string) ?? 'Shohei Ohtani',
      username: (input.username as string) ?? 'shohei',
      bio: (input.bio as string) ?? '',
    },
  })),
  setGoalVisibilityAction: vi.fn(async (input: { goalId: string; visibility: 'private' | 'public' }) => ({
    ok: true,
    data: input,
  })),
  getGoalVisibilityAction: vi.fn(),
  followUserAction: vi.fn(async () => ({
    ok: true,
    data: { following: true, followersCount: 11, followingCount: 4 },
  })),
  unfollowUserAction: vi.fn(async () => ({
    ok: true,
    data: { following: false, followersCount: 10, followingCount: 3 },
  })),
  blockUserAction: vi.fn(async ({ targetUserId }: { targetUserId: string }) => ({
    ok: true,
    data: { blocked: true, targetUserId },
  })),
  unblockUserAction: vi.fn(),
  listFollowConnectionsAction: vi.fn(async () => ({
    ok: true,
    data: {
      items: [
        {
          userId: 'u-2',
          username: 'ichiroruns',
          displayName: 'Ichiro Suzuki',
          bio: 'Daily batting practice',
          avatarUrl: null,
          isPrivate: false,
          isOwnProfile: false,
          isFollowing: false,
        },
      ],
    },
  })),
  discoverUsersAction: vi.fn(async () => ({
    ok: true,
    data: makeDiscover(),
  })),
  createSocialPostAction: vi.fn(async (input: Record<string, unknown>) => ({
    ok: true,
    data: makePost({
      headline: (input.headline as string) || 'New milestone',
      body: (input.body as string) || 'Hit my weekly target',
    }),
  })),
  updateSocialPostAction: vi.fn(),
  deleteSocialPostAction: vi.fn(),
  getSocialFeedAction: vi.fn(async () => ({
    ok: true,
    data: { items: [makePost()], nextCursor: null, followingCount: 1 },
  })),
  getSocialPostAction: vi.fn(),
  togglePostLikeAction: vi.fn(),
  addPostCommentAction: vi.fn(),
  deletePostCommentAction: vi.fn(),
  hideOrReportPostAction: vi.fn(),
  listSocialNotificationsAction: vi.fn(),
  markNotificationsReadAction: vi.fn(async () => ({
    ok: true,
    data: { unreadCount: 0 },
  })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makePost(overrides: Partial<SocialPostDTO> = {}): SocialPostDTO {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'milestone',
    visibility: 'public',
    headline: 'Completed 30 straight days of speed work',
    body: 'Stuck to every daily routine in key area #2.',
    imageUrl: null,
    stats: { tasksDone: 18, tasksTotal: 24, keyAreas: 8, actionsPlanned: 64 },
    goal: {
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Sub-3 Hour Marathon',
      status: 'active',
      achievedAt: null,
      visibility: 'public',
    },
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z',
    isOwnPost: true,
    author: {
      userId: 'u-1',
      username: 'shohei',
      displayName: 'Shohei Ohtani',
      avatarUrl: null,
    },
    likeCount: 3,
    commentCount: 1,
    likedByViewer: false,
    recentComments: [
      {
        id: 'c-1',
        postId: '11111111-1111-4111-8111-111111111111',
        body: 'Inspiring consistency!',
        createdAt: '2026-10-20T12:05:00.000Z',
        canDelete: true,
        author: {
          userId: 'u-2',
          username: 'ichiroruns',
          displayName: 'Ichiro Suzuki',
          avatarUrl: null,
        },
      },
    ],
    ...overrides,
  };
}

function makeProfile(overrides: Partial<SocialProfileDTO> = {}): SocialProfileDTO {
  return {
    userId: 'u-1',
    username: 'shohei',
    displayName: 'Shohei Ohtani',
    bio: 'Building daily excellence with the 64-chart.',
    location: 'Tokyo',
    website: 'https://example.com',
    avatarUrl: null,
    isPrivate: false,
    restricted: false,
    joinedAt: '2026-01-15T00:00:00.000Z',
    isOwnProfile: true,
    isFollowing: false,
    followsViewer: false,
    followersCount: 10,
    followingCount: 3,
    stats: {
      goalsCompleted: 2,
      activePublicGoals: 1,
      tasksCompleted: 48,
      postsCount: 5,
    },
    publicGoals: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Sub-3 Hour Marathon',
        status: 'active',
        targetDate: '2027-03-01',
        activatedOn: '2026-09-01',
        achievedAt: null,
        outcomeCount: 8,
        actionCount: 64,
        completedTasks: 18,
        totalTasks: 24,
      },
    ],
    ownGoals: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Sub-3 Hour Marathon',
        status: 'active',
        visibility: 'public',
        achievedAt: null,
        completedTasks: 18,
        totalTasks: 24,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Secret Personal Goal',
        status: 'active',
        visibility: 'private',
        achievedAt: null,
        completedTasks: 2,
        totalTasks: 10,
      },
    ],
    recentPosts: [makePost()],
    ...overrides,
  };
}

function makeDiscover(): DiscoverResultDTO {
  return {
    users: [
      {
        userId: 'u-2',
        username: 'ichiroruns',
        displayName: 'Ichiro Suzuki',
        bio: '3,000 hits one day at a time',
        avatarUrl: null,
        isOwnProfile: false,
        isFollowing: false,
        followersCount: 42,
        publicGoalTitle: 'Master daily mobility',
        reason: 'Sharing public Harada goals',
      },
    ],
    recentAchievements: [makePost({ isOwnPost: false })],
  };
}

function makeMockPostActions(): PostCardActions {
  return {
    toggleLike: vi.fn(async ({ postId }) => ({
      ok: true as const,
      data: { postId, liked: true, likeCount: 4 },
    })),
    addComment: vi.fn(async ({ postId, body }) => ({
      ok: true as const,
      data: {
        comment: {
          id: 'c-new',
          postId,
          body,
          createdAt: '2026-10-20T13:00:00.000Z',
          canDelete: true,
          author: {
            userId: 'u-1',
            username: 'shohei',
            displayName: 'Shohei Ohtani',
            avatarUrl: null,
          },
        },
        commentCount: 2,
      },
    })),
    deleteComment: vi.fn(async ({ commentId }) => ({
      ok: true as const,
      data: {
        deleted: true,
        commentId,
        postId: '11111111-1111-4111-8111-111111111111',
        commentCount: 0,
      },
    })),
    updatePost: vi.fn(async (input) => ({
      ok: true as const,
      data: makePost({ headline: input.headline ?? 'Updated headline' }),
    })),
    deletePost: vi.fn(async ({ postId }) => ({
      ok: true as const,
      data: { deleted: true, postId },
    })),
    hideOrReportPost: vi.fn(async ({ postId, action }) => ({
      ok: true as const,
      data: { hidden: true, reported: action === 'report', postId },
    })),
  };
}

describe('Avatar', () => {
  it('renders fallback initials when no avatarUrl is provided', () => {
    render(<Avatar displayName="Shohei Ohtani" username="shohei" />);
    expect(screen.getByLabelText('Shohei Ohtani avatar').textContent).toBe('SO');
  });
});

describe('PostCard', () => {
  it('renders achievement stats, toggles like, and adds/deletes comments', async () => {
    const actions = makeMockPostActions();
    render(<PostCard post={makePost()} actions={actions} />);

    expect(screen.getByText('Completed 30 straight days of speed work')).toBeTruthy();
    expect(screen.getByText('Sub-3 Hour Marathon')).toBeTruthy();
    expect(screen.getByText('18 of 24')).toBeTruthy();

    // Like post
    const likeBtn = screen.getByRole('button', { name: /like post/i });
    await userEvent.click(likeBtn);
    await waitFor(() => expect(actions.toggleLike).toHaveBeenCalled());

    // Open comments & post a comment
    const commentToggle = screen.getByRole('button', { name: /comments/i });
    await userEvent.click(commentToggle);
    expect(screen.getByText('Inspiring consistency!')).toBeTruthy();

    const input = screen.getByLabelText('Add a comment');
    await userEvent.type(input, 'Keep pushing forward!');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() =>
      expect(actions.addComment).toHaveBeenCalledWith({
        postId: '11111111-1111-4111-8111-111111111111',
        body: 'Keep pushing forward!',
      }),
    );
    expect(await screen.findByText('Keep pushing forward!')).toBeTruthy();
  });
});

describe('PostComposer', () => {
  it('prevents sharing a public post for a private goal until consent is checked', async () => {
    const createPost = vi.fn(async () => ({ ok: true as const, data: makePost() }));
    render(
      <PostComposer
        ownGoals={makeProfile().ownGoals}
        initialGoalId="33333333-3333-4333-8333-333333333333"
        createPost={createPost}
      />,
    );

    expect(screen.getAllByText(/Secret Personal Goal/i).length).toBeGreaterThan(0);
    const submitBtn = screen.getByRole('button', { name: /publish update/i });
    await userEvent.click(submitBtn);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(createPost).not.toHaveBeenCalled();

    // Check consent box to make goal public
    const consentCheckbox = screen.getByRole('checkbox', {
      name: /make this goal public on your profile/i,
    });
    await userEvent.click(consentCheckbox);
    await userEvent.type(screen.getByLabelText(/headline/i), 'Week 1 update');
    await userEvent.click(submitBtn);
    await waitFor(() => expect(createPost).toHaveBeenCalled());
  });
});

describe('ProfileView', () => {
  it('renders profile details, stats, public goals, connections drawer, and edit profile form', async () => {
    render(
      <ProfileView
        initialProfile={makeProfile()}
        postActions={makeMockPostActions()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Shohei Ohtani' })).toBeTruthy();
    expect(screen.getAllByText('@shohei').length).toBeGreaterThan(0);
    expect(screen.getByText('Building daily excellence with the 64-chart.')).toBeTruthy();
    expect(screen.getByText('48')).toBeTruthy(); // Tasks Completed

    // Open Followers drawer
    await userEvent.click(screen.getByRole('button', { name: /10 followers/i }));
    await waitFor(() => expect(screen.getAllByText('Ichiro Suzuki').length).toBeGreaterThanOrEqual(2));

    // Open Edit Profile
    await userEvent.click(screen.getByRole('button', { name: /edit profile/i }));
    const nameInput = screen.getByLabelText('Display name');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Shohei O.');
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));
    expect(await screen.findByText('Profile updated')).toBeTruthy();
  });
});

describe('CommunityHub', () => {
  it('shows empty feed guidance with suggested users when following nobody, and switches tabs', async () => {
    const emptyFeed: SocialFeedDTO = { items: [], nextCursor: null, followingCount: 0 };
    const notifs: SocialNotificationsListDTO = {
      unreadCount: 1,
      items: [
        {
          id: 'n-1',
          kind: 'new_follower',
          postId: null,
          commentId: null,
          readAt: null,
          createdAt: '2026-10-20T12:00:00.000Z',
          actor: {
            userId: 'u-2',
            username: 'ichiroruns',
            displayName: 'Ichiro Suzuki',
            avatarUrl: null,
          },
          postHeadline: null,
        },
      ],
    };

    render(
      <CommunityHub
        initialFeed={emptyFeed}
        initialProfile={makeProfile()}
        initialDiscover={makeDiscover()}
        initialNotifications={notifs}
        postActions={makeMockPostActions()}
      />,
    );

    // Helpful empty state when following nobody
    expect(screen.getByText(/Follow builders & athletes to fill your feed/i)).toBeTruthy();
    expect(screen.getByText('Ichiro Suzuki')).toBeTruthy();

    // Switch to Notifications tab
    await userEvent.click(screen.getByRole('tab', { name: /notifications/i }));
    expect(screen.getByText(/started following your journey/i)).toBeTruthy();

    // Switch to Discover tab
    await userEvent.click(screen.getByRole('tab', { name: /discover/i }));
    expect(screen.getByText('Master daily mobility')).toBeTruthy();
  });
});
