'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import type {
  DiscoverResultDTO,
  DiscoverUserDTO,
  SocialFeedDTO,
  SocialNotificationsListDTO,
  SocialPostDTO,
  SocialPostType,
  SocialProfileDTO,
} from '@/application/social';
import {
  createSocialPostAction,
  discoverUsersAction,
  followUserAction,
  getSocialFeedAction,
  markNotificationsReadAction,
  unfollowUserAction,
} from '@/app/actions/social';
import { Button } from '@/ui/primitives';
import { routes } from '@/ui/routes';
import { Avatar } from './Avatar';
import { PostCard, type PostCardActions } from './PostCard';
import { PostComposer } from './PostComposer';
import { ProfileView } from './ProfileView';
import {
  Card,
  defaultPostCardActions,
  LabeledInput,
  SocialEmptyState,
} from './ui-helpers';

export type CommunityTab = 'feed' | 'discover' | 'notifications' | 'profile';

export interface CommunityHubProps {
  initialTab?: CommunityTab;
  initialFeed: SocialFeedDTO;
  initialProfile: SocialProfileDTO;
  initialDiscover: DiscoverResultDTO;
  initialNotifications: SocialNotificationsListDTO;
  initialCompose?: {
    open?: boolean;
    goalId?: string | null;
    type?: SocialPostType;
    headline?: string;
  };
  postActions?: PostCardActions;
}

export function CommunityHub({
  initialTab = 'feed',
  initialFeed,
  initialProfile,
  initialDiscover,
  initialNotifications,
  initialCompose,
  postActions = defaultPostCardActions,
}: CommunityHubProps) {
  const [tab, setTab] = useState<CommunityTab>(initialTab);
  const [feedScope, setFeedScope] = useState<'following' | 'explore'>('following');
  const [feed, setFeed] = useState<SocialFeedDTO>(initialFeed);
  const [myProfile, setMyProfile] = useState<SocialProfileDTO>(initialProfile);
  const [discover, setDiscover] = useState<DiscoverResultDTO>(initialDiscover);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] =
    useState<SocialNotificationsListDTO>(initialNotifications);
  const [showComposer, setShowComposer] = useState<boolean>(Boolean(initialCompose?.open));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSwitchFeedScope = (nextScope: 'following' | 'explore') => {
    setFeedScope(nextScope);
    setErrorMessage(null);
    startTransition(async () => {
      const res = await getSocialFeedAction({ scope: nextScope, limit: 20 });
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      setFeed(res.data);
    });
  };

  const handleLoadMoreFeed = () => {
    if (!feed.nextCursor) return;
    startTransition(async () => {
      const res = await getSocialFeedAction({
        scope: feedScope,
        before: feed.nextCursor!.before,
        beforeId: feed.nextCursor!.beforeId,
        limit: 20,
      });
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      setFeed((prev) => ({
        items: [...prev.items, ...res.data.items],
        nextCursor: res.data.nextCursor,
        followingCount: res.data.followingCount,
      }));
    });
  };

  const handlePostCreated = (post: SocialPostDTO) => {
    setFeed((prev) => ({
      ...prev,
      items: [post, ...prev.items],
    }));
    setMyProfile((prev) => ({
      ...prev,
      recentPosts: [post, ...prev.recentPosts],
      ownGoals:
        post.goal?.visibility === 'public'
          ? prev.ownGoals.map((g) => (g.id === post.goal!.id ? { ...g, visibility: 'public' } : g))
          : prev.ownGoals,
    }));
    setShowComposer(false);
  };

  const handleSearchUsers = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    startTransition(async () => {
      const res = await discoverUsersAction({ query: searchQuery, limit: 20 });
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      setDiscover(res.data);
    });
  };

  const handleToggleFollowUser = (target: DiscoverUserDTO) => {
    const nextFollowing = !target.isFollowing;
    setErrorMessage(null);
    setDiscover((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.userId === target.userId
          ? {
              ...u,
              isFollowing: nextFollowing,
              followersCount: Math.max(0, u.followersCount + (nextFollowing ? 1 : -1)),
            }
          : u,
      ),
    }));
    setFeed((prev) => ({
      ...prev,
      followingCount: Math.max(0, prev.followingCount + (nextFollowing ? 1 : -1)),
    }));
    startTransition(async () => {
      const res = nextFollowing
        ? await followUserAction({ targetUserId: target.userId })
        : await unfollowUserAction({ targetUserId: target.userId });
      if (!res.ok) {
        setDiscover((prev) => ({
          ...prev,
          users: prev.users.map((u) =>
            u.userId === target.userId
              ? {
                  ...u,
                  isFollowing: !nextFollowing,
                  followersCount: Math.max(0, u.followersCount + (nextFollowing ? -1 : 1)),
                }
              : u,
          ),
        }));
        setErrorMessage(res.error.message);
      }
    });
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      const res = await markNotificationsReadAction({});
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      setNotifications((prev) => ({
        unreadCount: 0,
        items: prev.items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
      }));
    });
  };

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div role="alert" className="rounded-[var(--radius-sm)] border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {errorMessage}
        </div>
      )}

      {/* Top tab bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <div role="tablist" aria-label="Community sections" className="flex flex-wrap gap-1.5">
          <TabButton active={tab === 'feed'} onClick={() => setTab('feed')}>
            Activity Feed
          </TabButton>
          <TabButton active={tab === 'discover'} onClick={() => setTab('discover')}>
            Discover
          </TabButton>
          <TabButton active={tab === 'notifications'} onClick={() => setTab('notifications')}>
            Notifications
            {notifications.unreadCount > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.2 text-[10px] text-accent-ink">
                {notifications.unreadCount}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === 'profile'} onClick={() => setTab('profile')}>
            My Profile (@{myProfile.username})
          </TabButton>
        </div>

        {tab === 'feed' && (
          <Button
            type="button"
            size="sm"
            variant={showComposer ? 'secondary' : 'primary'}
            onClick={() => setShowComposer((v) => !v)}
          >
            {showComposer ? 'Hide composer' : '+ Share update'}
          </Button>
        )}
      </div>

      {/* FEED TAB */}
      {tab === 'feed' && (
        <div className="space-y-5">
          {showComposer && (
            <PostComposer
              ownGoals={myProfile.ownGoals}
              initialGoalId={initialCompose?.goalId ?? undefined}
              initialType={initialCompose?.type}
              createPost={createSocialPostAction}
              onCreated={handlePostCreated}
              onCancel={() => setShowComposer(false)}
            />
          )}

          {/* Sub-filter: Following vs Explore */}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex rounded-[var(--radius-sm)] border border-rule bg-surface-sunken p-0.5">
              <button
                type="button"
                onClick={() => handleSwitchFeedScope('following')}
                className={`rounded-[var(--radius-sm)] px-3 py-1 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors ${
                  feedScope === 'following'
                    ? 'bg-surface text-ink shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Following
              </button>
              <button
                type="button"
                onClick={() => handleSwitchFeedScope('explore')}
                className={`rounded-[var(--radius-sm)] px-3 py-1 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors ${
                  feedScope === 'explore'
                    ? 'bg-surface text-ink shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Community Explore
              </button>
            </div>
            <span className="font-mono text-[11px] text-ink-muted">
              Chronological · Real progress
            </span>
          </div>

          {feed.items.length === 0 ? (
            <div className="space-y-5">
              <SocialEmptyState
                index="COMMUNITY FEED"
                title={
                  feedScope === 'following' && feed.followingCount === 0
                    ? 'Follow builders & athletes to fill your feed'
                    : 'No activity posts yet'
                }
                body={
                  feedScope === 'following' && feed.followingCount === 0
                    ? 'Your feed shows real milestones, daily execution streaks, and completed goals from people you follow — in chronological order.'
                    : 'Share a progress update on your goal or explore recent community achievements.'
                }
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setShowComposer(true)}
                    >
                      Share your first update
                    </Button>
                    {feedScope === 'following' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSwitchFeedScope('explore')}
                      >
                        Browse Community Explore
                      </Button>
                    )}
                  </div>
                }
              />

              {/* Suggested users right inside the empty feed */}
              {discover.users.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-mono text-[11px] tracking-[0.18em] text-ink-muted uppercase">
                      Suggested People to Follow
                    </h3>
                    <button
                      type="button"
                      onClick={() => setTab('discover')}
                      className="font-mono text-[11px] text-accent underline underline-offset-2"
                    >
                      See all in Discover →
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {discover.users.slice(0, 4).map((u) => (
                      <DiscoverUserCard
                        key={u.userId}
                        user={u}
                        onToggleFollow={() => handleToggleFollowUser(u)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {feed.items.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  actions={postActions}
                  onPostUpdated={(updated) =>
                    setFeed((prev) => ({
                      ...prev,
                      items: prev.items.map((p) => (p.id === updated.id ? updated : p)),
                    }))
                  }
                  onPostDeleted={(postId) =>
                    setFeed((prev) => ({
                      ...prev,
                      items: prev.items.filter((p) => p.id !== postId),
                    }))
                  }
                />
              ))}

              {feed.nextCursor && (
                <div className="flex justify-center pt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    loading={pending}
                    onClick={handleLoadMoreFeed}
                  >
                    Load earlier posts
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* DISCOVER TAB */}
      {tab === 'discover' && (
        <div className="space-y-6">
          <Card padding="md">
            <form onSubmit={handleSearchUsers} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <LabeledInput
                  label="Find people by username or display name"
                  placeholder="Search @username or name…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button type="submit" size="md" loading={pending}>
                Search
              </Button>
              {searchQuery && (
                <Button
                  type="button"
                  size="md"
                  variant="ghost"
                  onClick={() => {
                    setSearchQuery('');
                    startTransition(async () => {
                      const res = await discoverUsersAction({ query: '', limit: 20 });
                      if (res.ok) setDiscover(res.data);
                    });
                  }}
                >
                  Reset
                </Button>
              )}
            </form>
          </Card>

          <section className="space-y-3">
            <h3 className="font-mono text-[11px] tracking-[0.18em] text-ink-muted uppercase">
              {searchQuery.trim() ? 'Matching People' : 'Recommended Goal Pursuers'}
            </h3>
            {discover.users.length === 0 ? (
              <Card padding="md">
                <p className="text-sm text-ink-muted">No matching users found.</p>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {discover.users.map((u) => (
                  <DiscoverUserCard
                    key={u.userId}
                    user={u}
                    onToggleFollow={() => handleToggleFollowUser(u)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-mono text-[11px] tracking-[0.18em] text-ink-muted uppercase">
              Recent Public Achievements & Milestones
            </h3>
            {discover.recentAchievements.length === 0 ? (
              <Card padding="md">
                <p className="text-sm text-ink-muted">No public achievements shared yet.</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {discover.recentAchievements.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    actions={postActions}
                    onPostUpdated={(updated) =>
                      setDiscover((prev) => ({
                        ...prev,
                        recentAchievements: prev.recentAchievements.map((p) =>
                          p.id === updated.id ? updated : p,
                        ),
                      }))
                    }
                    onPostDeleted={(postId) =>
                      setDiscover((prev) => ({
                        ...prev,
                        recentAchievements: prev.recentAchievements.filter((p) => p.id !== postId),
                      }))
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* NOTIFICATIONS TAB */}
      {tab === 'notifications' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-[11px] tracking-[0.18em] text-ink-muted uppercase">
              Recent Activity on Your Journey ({notifications.unreadCount} unread)
            </h3>
            {notifications.unreadCount > 0 && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={pending}
                onClick={handleMarkAllRead}
              >
                Mark all read
              </Button>
            )}
          </div>

          {notifications.items.length === 0 ? (
            <SocialEmptyState
              index="NOTIFICATIONS"
              title="All caught up"
              body="When someone follows you, applauds your progress, or comments on your milestones, you will see it here."
            />
          ) : (
            <Card padding="none">
              <ul className="divide-y divide-rule">
                {notifications.items.map((n) => (
                  <li
                    key={n.id}
                    className={`flex items-start justify-between gap-3 px-4 py-3 ${
                      !n.readAt ? 'bg-surface-sunken/60' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Link href={routes.profile(n.actor.username)}>
                        <Avatar
                          displayName={n.actor.displayName}
                          username={n.actor.username}
                          avatarUrl={n.actor.avatarUrl}
                          size="sm"
                        />
                      </Link>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-ink">
                          <Link
                            href={routes.profile(n.actor.username)}
                            className="font-medium hover:text-accent"
                          >
                            {n.actor.displayName}
                          </Link>{' '}
                          <span className="text-ink-muted">{formatNotificationCopy(n.kind)}</span>
                          {n.postHeadline && (
                            <span className="font-medium text-ink"> “{n.postHeadline}”</span>
                          )}
                        </p>
                        <p className="font-mono text-[10px] text-ink-muted">
                          @{n.actor.username} · {new Date(n.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {!n.readAt && (
                      <span
                        aria-label="Unread"
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {/* MY PROFILE TAB */}
      {tab === 'profile' && (
        <ProfileView
          initialProfile={myProfile}
          onProfileUpdated={setMyProfile}
          postActions={postActions}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-[var(--radius-sm)] px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors ${
        active
          ? 'bg-ink text-paper'
          : 'border border-rule bg-surface text-ink-muted hover:border-ink hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function DiscoverUserCard({
  user,
  onToggleFollow,
}: {
  user: DiscoverUserDTO;
  onToggleFollow: () => void;
}) {
  return (
    <Card padding="md" className="flex flex-col justify-between gap-3">
      <div className="flex items-start justify-between gap-3">
        <Link href={routes.profile(user.username)} className="flex min-w-0 items-start gap-3">
          <Avatar
            displayName={user.displayName}
            username={user.username}
            avatarUrl={user.avatarUrl}
            size="md"
          />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink hover:text-accent">{user.displayName}</p>
            <p className="truncate font-mono text-[11px] text-ink-muted">@{user.username}</p>
            {user.bio && (
              <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{user.bio}</p>
            )}
          </div>
        </Link>
        {!user.isOwnProfile && (
          <Button
            type="button"
            size="sm"
            variant={user.isFollowing ? 'secondary' : 'primary'}
            onClick={onToggleFollow}
          >
            {user.isFollowing ? 'Following' : 'Follow'}
          </Button>
        )}
      </div>

      <div className="space-y-1 border-t border-rule pt-2">
        {user.publicGoalTitle && (
          <p className="truncate text-xs text-ink-muted">
            <span className="font-mono text-[10px] tracking-[0.12em] text-ink-muted uppercase">
              Working toward:{' '}
            </span>
            <span className="font-medium text-ink">{user.publicGoalTitle}</span>
          </p>
        )}
        <div className="flex items-center justify-between font-mono text-[10px] text-ink-muted">
          <span>{user.reason}</span>
          <span>{user.followersCount} followers</span>
        </div>
      </div>
    </Card>
  );
}

function formatNotificationCopy(kind: string): string {
  switch (kind) {
    case 'new_follower':
      return 'started following your journey.';
    case 'post_liked':
      return 'applauded your post';
    case 'post_commented':
      return 'commented on your post';
    case 'followed_milestone':
      return 'shared a new milestone';
    default:
      return 'interacted with your profile';
  }
}
