// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SocialPostDTO, SocialProfileDTO } from '@/application/social';
import * as actions from '@/app/actions/social';
import { AchievementCard } from './AchievementCard';
import { FoundingCredential, FoundingMark } from './FoundingBadge';
import { PostCard, type PostCardActions } from './PostCard';
import { PrimaryGoalPanel } from './PrimaryGoalPanel';
import { ProfileView } from './ProfileView';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

vi.mock('@/app/actions/social', () => ({
  blockUserAction: vi.fn(async ({ targetUserId }: { targetUserId: string }) => ({
    ok: true,
    data: { blocked: true, targetUserId },
  })),
  unblockUserAction: vi.fn(async ({ targetUserId }: { targetUserId: string }) => ({
    ok: true,
    data: { blocked: false, targetUserId },
  })),
  listBlockedUsersAction: vi.fn(async () => ({
    ok: true,
    data: { items: [{ userId: 'u-9', username: 'troll', displayName: 'Troll', blockedAt: '2026-10-01T00:00:00Z' }] },
  })),
  createSocialPostAction: vi.fn(async () => ({ ok: true, data: makePost({ id: 'p-new' }) })),
  setAchievementVisibilityAction: vi.fn(async (input: { achievementId: string; hidden: boolean }) => ({
    ok: true,
    data: input,
  })),
  updateSocialProfileAction: vi.fn(async (input: Record<string, boolean>) => ({
    ok: true,
    data: makeProfile({ isOwnProfile: true, privacy: { ...basePrivacy, ...input } }),
  })),
  followUserAction: vi.fn(),
  unfollowUserAction: vi.fn(),
  getSocialFeedAction: vi.fn(),
  listFollowConnectionsAction: vi.fn(),
  setGoalVisibilityAction: vi.fn(),
  togglePostLikeAction: vi.fn(),
  addPostCommentAction: vi.fn(),
  deletePostCommentAction: vi.fn(),
  getSocialPostAction: vi.fn(),
  updateSocialPostAction: vi.fn(),
  deleteSocialPostAction: vi.fn(),
  hideOrReportPostAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const basePrivacy = { showAchievements: true, showProgressMetrics: true, foundingBadgeOnPosts: true };

const metrics = {
  daysPursuing: 84,
  actionsCompleted: 237,
  tasksCompleted: 40,
  tasksTotal: 56,
  routineCheckins: 197,
  keyAreasComplete: 6,
  keyAreasTotal: 8,
  consistency: { activeDays: 26, windowDays: 30, rate: 0.8667 },
};

function makeProfile(overrides: Partial<SocialProfileDTO> = {}): SocialProfileDTO {
  return {
    userId: 'u-1',
    username: 'maya',
    displayName: 'Maya Chen',
    bio: '',
    location: '',
    website: '',
    avatarUrl: null,
    isPrivate: false,
    restricted: false,
    joinedAt: '2026-01-15T00:00:00.000Z',
    isOwnProfile: false,
    isFollowing: false,
    followsViewer: false,
    followersCount: 0,
    followingCount: 0,
    stats: { goalsCompleted: 0, activePublicGoals: 1, tasksCompleted: 40, postsCount: 0 },
    publicGoals: [],
    ownGoals: [],
    recentPosts: [],
    foundingMember: { number: 42, since: '2026-10-01T00:00:00.000Z' },
    primaryGoal: {
      id: 'g-1',
      title: 'Make the New York Philharmonic',
      status: 'active',
      activatedOn: '2026-08-04',
      targetDate: null,
      achievedAt: null,
      metrics,
    },
    achievements: [
      {
        id: 'a-1',
        key: 'active_days_30',
        title: '30 Days of Progress',
        earnedAt: '2026-09-10T00:00:00.000Z',
        stat: { days: 30 },
        hidden: false,
        goal: null,
        postId: null,
      },
    ],
    privacy: null,
    ...overrides,
  };
}

function makePost(overrides: Partial<SocialPostDTO> = {}): SocialPostDTO {
  return {
    id: 'p-1',
    type: 'progress_update',
    visibility: 'public',
    headline: 'Week 12',
    body: 'Scales every morning.',
    imageUrl: null,
    stats: null,
    goal: null,
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z',
    isOwnPost: false,
    author: { userId: 'u-1', username: 'maya', displayName: 'Maya Chen', avatarUrl: null, foundingMemberNumber: 42 },
    likeCount: 0,
    commentCount: 0,
    likedByViewer: false,
    recentComments: [],
    ...overrides,
  };
}

const postActions: PostCardActions = {
  toggleLike: vi.fn(),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
};

describe('Founding Member credential', () => {
  it('renders the number as a credential, with an accessible name', () => {
    render(<FoundingCredential number={42} since="2026-10-01T00:00:00.000Z" />);
    const region = screen.getByRole('region', { name: 'Harada Founding Member No. 0042' });
    expect(within(region).getByText('No. 0042')).toBeTruthy();
    expect(within(region).getByText(/Among the first 100 members helping build Harada/)).toBeTruthy();
    expect(within(region).getByText(/Since October 2026/)).toBeTruthy();
  });

  it('the compact mark names itself for screen readers', () => {
    render(<FoundingMark number={7} />);
    expect(screen.getByLabelText('Founding Member No. 0007')).toBeTruthy();
  });
});

describe('PrimaryGoalPanel', () => {
  it('shows the goal and every metric with its definition available', () => {
    render(<PrimaryGoalPanel goal={makeProfile().primaryGoal!} />);
    expect(screen.getByRole('heading', { name: 'Make the New York Philharmonic' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: /Tasks completed · 40 of 56/ })).toBeTruthy();
    expect(screen.getByText('84')).toBeTruthy();
    expect(screen.getByText('237')).toBeTruthy();
    expect(screen.getByText('87%')).toBeTruthy();
    expect(screen.getByText('26 of 30 days')).toBeTruthy();
    expect(screen.getByText('6/8')).toBeTruthy();
    expect(screen.getByText('How these are measured')).toBeTruthy();
  });

  it('shows only the title when metrics are hidden', () => {
    render(<PrimaryGoalPanel goal={{ ...makeProfile().primaryGoal!, metrics: null }} />);
    expect(screen.getByRole('heading', { name: 'Make the New York Philharmonic' })).toBeTruthy();
    expect(screen.queryByText('Actions completed')).toBeNull();
  });
});

describe('AchievementCard', () => {
  it('stands alone: brand, title, goal, date, figure, holder and the verification line', () => {
    render(
      <AchievementCard
        achievement={{
          key: 'goal_completed',
          title: 'Goal Completed',
          earnedAt: '2026-10-02T15:00:00.000Z',
          stat: {},
          goal: { title: 'Run a marathon' },
        }}
        holder={{ displayName: 'Maya Chen', username: 'maya' }}
      />,
    );
    expect(screen.getByText('Harada')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Goal Completed' })).toBeTruthy();
    expect(screen.getByText('Run a marathon')).toBeTruthy();
    expect(screen.getByText('Oct 2, 2026')).toBeTruthy();
    expect(screen.getByText('Maya Chen · @maya')).toBeTruthy();
    expect(screen.getByText('Verified from activity recorded in Harada')).toBeTruthy();
  });
});

describe('PostCard identity', () => {
  it('shows the founding mark beside the author and links to the profile', () => {
    render(<PostCard post={makePost()} actions={postActions} />);
    expect(screen.getByLabelText('Founding Member No. 0042')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /maya/i })[0]!.getAttribute('href')).toBe('/u/maya');
  });

  it('omits the mark when the author is not a founder or hides it', () => {
    render(<PostCard post={makePost({ author: { ...makePost().author, foundingMemberNumber: null } })} actions={postActions} />);
    expect(screen.queryByLabelText(/Founding Member No\./)).toBeNull();
  });

  it('renders a verified achievement post as a card, not as a free-text headline', () => {
    render(
      <PostCard
        post={makePost({
          type: 'achievement',
          headline: '30 Days of Progress',
          achievement: { id: 'a-1', key: 'active_days_30', title: '30 Days of Progress', earnedAt: '2026-09-10T00:00:00Z', stat: { days: 30 } },
        })}
        actions={postActions}
      />,
    );
    expect(screen.getByTestId('achievement-active_days_30')).toBeTruthy();
    expect(screen.getByText('30 days with recorded progress')).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: '30 Days of Progress' })).toHaveLength(1);
  });

  it('labels self-reported milestones as such', () => {
    render(<PostCard post={makePost({ type: 'milestone', headline: 'Ran 20 miles' })} actions={postActions} />);
    expect(screen.getByText('Self-reported')).toBeTruthy();
  });
});

describe('ProfileView identity', () => {
  it("shows another member's credential, featured goal and achievements, without owner controls", () => {
    render(<ProfileView initialProfile={makeProfile()} postActions={postActions} />);
    expect(screen.getByRole('region', { name: 'Harada Founding Member No. 0042' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Make the New York Philharmonic' })).toBeTruthy();
    expect(screen.getByTestId('achievement-active_days_30')).toBeTruthy();
    expect(screen.queryByText('Profile privacy')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('a private profile shows the credential but no goal or achievements', () => {
    render(
      <ProfileView
        initialProfile={makeProfile({ restricted: true, isPrivate: true, primaryGoal: null, achievements: [] })}
        postActions={postActions}
      />,
    );
    expect(screen.getByRole('region', { name: 'Harada Founding Member No. 0042' })).toBeTruthy();
    expect(screen.getByText('This profile is private')).toBeTruthy();
    expect(screen.queryByText('Make the New York Philharmonic')).toBeNull();
  });

  it('an empty profile states what to do, without fabricated figures', () => {
    render(
      <ProfileView
        initialProfile={makeProfile({
          isOwnProfile: true,
          foundingMember: null,
          primaryGoal: null,
          achievements: [],
          privacy: basePrivacy,
        })}
        postActions={postActions}
      />,
    );
    expect(screen.getByText(/Make a goal public to feature it here/)).toBeTruthy();
    expect(screen.getByText(/Achievements appear here as your recorded work earns them/)).toBeTruthy();
    expect(screen.queryByText('Days pursuing')).toBeNull();
    // Founding badge preference only appears for founders.
    expect(screen.queryByLabelText(/Founding Member badge on posts/)).toBeNull();
  });

  it('the owner can share an achievement, hide it, and change privacy settings', async () => {
    render(
      <ProfileView initialProfile={makeProfile({ isOwnProfile: true, privacy: basePrivacy })} postActions={postActions} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() =>
      expect(actions.createSocialPostAction).toHaveBeenCalledWith({
        type: 'achievement',
        achievementId: 'a-1',
        visibility: 'public',
      }),
    );
    expect(await screen.findByText('Shared with the community')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Hide 30 Days of Progress on my profile' }));
    await waitFor(() =>
      expect(actions.setAchievementVisibilityAction).toHaveBeenCalledWith({ achievementId: 'a-1', hidden: true }),
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /Show progress figures/ }));
    await waitFor(() =>
      expect(actions.updateSocialProfileAction).toHaveBeenCalledWith({ showProgressMetrics: false }),
    );
    expect(screen.getByRole('checkbox', { name: /Show my Founding Member badge on posts/ })).toBeTruthy();
  });

  it('the owner can list and unblock blocked accounts', async () => {
    render(
      <ProfileView initialProfile={makeProfile({ isOwnProfile: true, privacy: basePrivacy })} postActions={postActions} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(await screen.findByText('@troll')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Unblock' }));
    await waitFor(() => expect(actions.unblockUserAction).toHaveBeenCalledWith({ targetUserId: 'u-9' }));
    expect(await screen.findByText('You have not blocked anyone.')).toBeTruthy();
  });

  it('blocking asks for confirmation first, then leaves the profile', async () => {
    render(<ProfileView initialProfile={makeProfile()} postActions={postActions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Block' }));
    expect(actions.blockUserAction).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(actions.blockUserAction).toHaveBeenCalledWith({ targetUserId: 'u-1' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/community'));
  });
});
