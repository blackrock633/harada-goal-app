'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type {
  BlockedUserDTO,
  FollowConnectionDTO,
  GoalVisibility,
  OwnGoalVisibilityDTO,
  ProfileAchievementDTO,
  ProfilePrivacyDTO,
  SocialFeedCursorDTO,
  SocialPostDTO,
  SocialProfileDTO,
} from '@/application/social';
import {
  blockUserAction,
  createSocialPostAction,
  followUserAction,
  getSocialFeedAction,
  listBlockedUsersAction,
  listFollowConnectionsAction,
  setAchievementVisibilityAction,
  setGoalVisibilityAction,
  unblockUserAction,
  unfollowUserAction,
  updateSocialProfileAction,
} from '@/app/actions/social';
import { Button, ConfirmDialog } from '@/ui/primitives';
import { routes } from '@/ui/routes';
import { AchievementCard } from './AchievementCard';
import { Avatar, readImageFileAsDataUrl } from './Avatar';
import { FoundingCredential, FoundingMark } from './FoundingBadge';
import { PostCard, type PostCardActions } from './PostCard';
import { PrimaryGoalPanel } from './PrimaryGoalPanel';
import {
  Card,
  defaultPostCardActions,
  LabeledInput,
  LabeledTextarea,
  SocialEmptyState,
} from './ui-helpers';

export interface ProfileViewProps {
  initialProfile: SocialProfileDTO;
  onProfileUpdated?: (profile: SocialProfileDTO) => void;
  postActions?: PostCardActions;
}

export function ProfileView({
  initialProfile,
  onProfileUpdated,
  postActions = defaultPostCardActions,
}: ProfileViewProps) {
  const [profile, setProfile] = useState<SocialProfileDTO>(initialProfile);
  const [posts, setPosts] = useState<SocialPostDTO[]>(initialProfile.recentPosts);
  const [cursor, setCursor] = useState<SocialFeedCursorDTO | null>(
    initialProfile.recentPosts.length >= 20
      ? {
          before: initialProfile.recentPosts[initialProfile.recentPosts.length - 1]!.createdAt,
          beforeId: initialProfile.recentPosts[initialProfile.recentPosts.length - 1]!.id,
        }
      : null,
  );
  const [previewPublic, setPreviewPublic] = useState(false);
  const [editing, setEditing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Edit form fields
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [location, setLocation] = useState(profile.location);
  const [website, setWebsite] = useState(profile.website);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl);
  const [isPrivate, setIsPrivate] = useState(profile.isPrivate);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // Connections drawer state
  const [connectionsKind, setConnectionsKind] = useState<'followers' | 'following' | null>(null);
  const [connections, setConnections] = useState<FollowConnectionDTO[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);

  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocked, setBlocked] = useState<BlockedUserDTO[] | null>(null);
  const router = useRouter();

  const [pending, startTransition] = useTransition();

  const updateProfileState = (next: SocialProfileDTO) => {
    setProfile(next);
    setPosts(next.recentPosts);
    onProfileUpdated?.(next);
  };

  const handleToggleFollow = () => {
    const nextFollowing = !profile.isFollowing;
    setErrorMessage(null);
    setProfile((p) => ({
      ...p,
      isFollowing: nextFollowing,
      followersCount: Math.max(0, p.followersCount + (nextFollowing ? 1 : -1)),
    }));
    startTransition(async () => {
      const res = nextFollowing
        ? await followUserAction({ targetUserId: profile.userId })
        : await unfollowUserAction({ targetUserId: profile.userId });
      if (!res.ok) {
        setProfile((p) => ({
          ...p,
          isFollowing: !nextFollowing,
          followersCount: Math.max(0, p.followersCount + (nextFollowing ? -1 : 1)),
        }));
        setErrorMessage(res.error.message);
      } else {
        setStatusMessage(
          nextFollowing
            ? `Following @${profile.username}`
            : `Unfollowed @${profile.username}`,
        );
      }
    });
  };

  const handleBlock = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const res = await blockUserAction({ targetUserId: profile.userId });
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      setStatusMessage(`Blocked @${profile.username}`);
      router.push(routes.community);
    });
  };

  const handlePrivacyChange = (key: keyof ProfilePrivacyDTO, value: boolean) => {
    setErrorMessage(null);
    startTransition(async () => {
      const res = await updateSocialProfileAction({ [key]: value });
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      updateProfileState(res.data);
      setStatusMessage('Privacy settings saved');
    });
  };

  const handleAchievementHidden = (a: ProfileAchievementDTO, hidden: boolean) => {
    setErrorMessage(null);
    startTransition(async () => {
      const res = await setAchievementVisibilityAction({ achievementId: a.id, hidden });
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      setProfile((p) => ({
        ...p,
        achievements: p.achievements.map((x) => (x.id === a.id ? { ...x, hidden } : x)),
      }));
      setStatusMessage(hidden ? `${a.title} is hidden from your profile` : `${a.title} is shown on your profile`);
    });
  };

  const handleShareAchievement = (a: ProfileAchievementDTO) => {
    setErrorMessage(null);
    startTransition(async () => {
      const res = await createSocialPostAction({ type: 'achievement', achievementId: a.id, visibility: 'public' });
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      setProfile((p) => ({
        ...p,
        achievements: p.achievements.map((x) => (x.id === a.id ? { ...x, postId: res.data.id } : x)),
      }));
      setPosts((prev) => (prev.some((p) => p.id === res.data.id) ? prev : [res.data, ...prev]));
      setStatusMessage(`Shared ${a.title} with the community`);
    });
  };

  const handleLoadBlocked = () => {
    startTransition(async () => {
      const res = await listBlockedUsersAction();
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      setBlocked(res.data.items);
    });
  };

  const handleUnblock = (user: BlockedUserDTO) => {
    startTransition(async () => {
      const res = await unblockUserAction({ targetUserId: user.userId });
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      setBlocked((prev) => (prev ?? []).filter((b) => b.userId !== user.userId));
      setStatusMessage(`Unblocked @${user.username}`);
    });
  };

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file, 250 * 1024);
      setAvatarUrl(dataUrl);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Invalid image');
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setErrorMessage(null);
    startTransition(async () => {
      const res = await updateSocialProfileAction({
        displayName,
        username,
        bio,
        location,
        website,
        avatarUrl,
        isPrivate,
      });
      if (!res.ok) {
        if (res.error.fieldErrors) setFieldErrors(res.error.fieldErrors);
        setErrorMessage(res.error.message);
        return;
      }
      updateProfileState(res.data);
      setEditing(false);
      setStatusMessage('Profile updated');
    });
  };

  const handleOpenConnections = (kind: 'followers' | 'following') => {
    if (connectionsKind === kind) {
      setConnectionsKind(null);
      return;
    }
    setConnectionsKind(kind);
    setConnectionsLoading(true);
    startTransition(async () => {
      const res = await listFollowConnectionsAction({ userId: profile.userId, kind });
      setConnectionsLoading(false);
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      setConnections(res.data.items);
    });
  };

  const handleToggleConnectionFollow = (conn: FollowConnectionDTO) => {
    const nextFollowing = !conn.isFollowing;
    setConnections((prev) =>
      prev.map((c) => (c.userId === conn.userId ? { ...c, isFollowing: nextFollowing } : c)),
    );
    startTransition(async () => {
      const res = nextFollowing
        ? await followUserAction({ targetUserId: conn.userId })
        : await unfollowUserAction({ targetUserId: conn.userId });
      if (!res.ok) {
        setConnections((prev) =>
          prev.map((c) => (c.userId === conn.userId ? { ...c, isFollowing: !nextFollowing } : c)),
        );
        setErrorMessage(res.error.message);
      }
    });
  };

  const handleGoalVisibilityToggle = (goal: OwnGoalVisibilityDTO, nextVis: GoalVisibility) => {
    setErrorMessage(null);
    startTransition(async () => {
      const res = await setGoalVisibilityAction({ goalId: goal.id, visibility: nextVis });
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      setProfile((prev) => {
        const nextOwn = prev.ownGoals.map((g) =>
          g.id === goal.id ? { ...g, visibility: nextVis } : g,
        );
        const nextPublic =
          nextVis === 'public'
            ? [
                ...prev.publicGoals.filter((p) => p.id !== goal.id),
                {
                  id: goal.id,
                  title: goal.title,
                  status: goal.status,
                  targetDate: null,
                  activatedOn: null,
                  achievedAt: goal.achievedAt,
                  outcomeCount: 8,
                  actionCount: 64,
                  completedTasks: goal.completedTasks,
                  totalTasks: goal.totalTasks,
                },
              ]
            : prev.publicGoals.filter((p) => p.id !== goal.id);
        return {
          ...prev,
          ownGoals: nextOwn,
          publicGoals: nextPublic,
          recentPosts:
            nextVis === 'private'
              ? prev.recentPosts.map((post) =>
                  post.goal?.id === goal.id
                    ? { ...post, goal: { ...post.goal, visibility: 'private' } }
                    : post,
                )
              : prev.recentPosts,
        };
      });
      setStatusMessage(
        nextVis === 'public' ? 'Goal is now visible on your profile' : 'Goal is now private',
      );
    });
  };

  const handleLoadMorePosts = () => {
    if (!cursor) return;
    startTransition(async () => {
      const res = await getSocialFeedAction({
        scope: 'profile',
        userId: profile.userId,
        before: cursor.before,
        beforeId: cursor.beforeId,
        limit: 20,
      });
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      setPosts((prev) => [...prev, ...res.data.items]);
      setCursor(res.data.nextCursor);
    });
  };

  const visiblePosts = previewPublic
    ? posts.filter(
        (p) =>
          p.visibility === 'public' &&
          (!p.goal || p.goal.visibility === 'public'),
      )
    : posts;

  const isViewingAsOwner = profile.isOwnProfile && !previewPublic;
  // The public preview applies the same rules the database applies for other viewers.
  const visibleAchievements = isViewingAsOwner
    ? profile.achievements
    : previewPublic && profile.privacy && !profile.privacy.showAchievements
      ? []
      : profile.achievements.filter((a) => !a.hidden);
  const isRestrictedView = profile.restricted || (previewPublic && profile.isPrivate);

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div role="alert" className="rounded-[var(--radius-sm)] border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {errorMessage}
        </div>
      )}
      {statusMessage && (
        <div role="status" className="rounded-[var(--radius-sm)] border border-rule bg-surface px-3 py-2 text-xs text-ink-muted">
          {statusMessage}
        </div>
      )}

      {/* Header Card */}
      <Card padding="lg" className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Avatar
              displayName={profile.displayName}
              username={profile.username}
              avatarUrl={profile.avatarUrl}
              size="lg"
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-serif text-2xl text-ink">{profile.displayName}</h2>
                {profile.isPrivate && (
                  <span className="rounded-[var(--radius-sm)] border border-rule bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] tracking-[0.14em] text-ink-muted uppercase">
                    Private profile
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-xs text-ink-muted">@{profile.username}</p>
                {profile.foundingMember && <FoundingMark number={profile.foundingMember.number} />}
              </div>
              {profile.bio && (
                <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-ink">
                  {profile.bio}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-ink-muted">
                {profile.location && <span>{profile.location}</span>}
                {profile.website && (
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline underline-offset-2 hover:text-ink"
                  >
                    {profile.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                <span>Joined {formatJoinedDate(profile.joinedAt)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {profile.isOwnProfile ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setPreviewPublic((v) => !v)}
                >
                  {previewPublic ? 'Exit public preview' : 'View as public'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditing((v) => !v)}
                >
                  {editing ? 'Close editor' : 'Edit Profile'}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant={profile.isFollowing ? 'secondary' : 'primary'}
                  disabled={pending}
                  onClick={handleToggleFollow}
                >
                  {profile.isFollowing ? 'Following' : 'Follow'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setConfirmBlock(true)}
                >
                  Block
                </Button>
                <ConfirmDialog
                  open={confirmBlock}
                  onOpenChange={setConfirmBlock}
                  title={`Block @${profile.username}?`}
                  description="You will stop following each other, and neither of you will see the other's profile, posts or comments. You can unblock them later from your own profile."
                  confirmText="Block"
                  destructive
                  onConfirm={handleBlock}
                />
              </>
            )}
          </div>
        </div>

        {profile.foundingMember && (
          <FoundingCredential number={profile.foundingMember.number} since={profile.foundingMember.since} />
        )}

        {/* Follower / Following counts */}
        <div className="flex flex-wrap items-center gap-6 border-t border-rule pt-4">
          <button
            type="button"
            aria-label={`${profile.followersCount} Followers`}
            onClick={() => handleOpenConnections('followers')}
            className="group flex items-baseline gap-1.5 text-left"
          >
            <span className="font-mono text-base font-medium text-ink">
              {profile.followersCount}
            </span>
            <span className="font-mono text-[11px] tracking-[0.14em] text-ink-muted uppercase group-hover:text-ink">
              Followers
            </span>
          </button>
          <button
            type="button"
            aria-label={`${profile.followingCount} Following`}
            onClick={() => handleOpenConnections('following')}
            className="group flex items-baseline gap-1.5 text-left"
          >
            <span className="font-mono text-base font-medium text-ink">
              {profile.followingCount}
            </span>
            <span className="font-mono text-[11px] tracking-[0.14em] text-ink-muted uppercase group-hover:text-ink">
              Following
            </span>
          </button>
          {profile.followsViewer && !profile.isOwnProfile && (
            <span className="rounded-[var(--radius-sm)] border border-rule bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-ink-muted uppercase">
              Follows you
            </span>
          )}
        </div>

        {/* Connections list drawer */}
        {connectionsKind && (
          <div className="space-y-3 rounded-[var(--radius-sm)] border border-rule bg-surface-sunken/50 p-3">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] tracking-[0.16em] text-ink-muted uppercase">
                {connectionsKind === 'followers' ? 'Followers' : 'Following'}
              </p>
              <button
                type="button"
                onClick={() => setConnectionsKind(null)}
                className="font-mono text-[11px] text-ink-muted hover:text-ink"
              >
                Close
              </button>
            </div>
            {connectionsLoading ? (
              <p className="font-mono text-xs text-ink-muted">Loading…</p>
            ) : connections.length === 0 ? (
              <p className="text-xs text-ink-muted">
                {connectionsKind === 'followers'
                  ? 'No followers yet.'
                  : 'Not following anyone yet.'}
              </p>
            ) : (
              <ul className="divide-y divide-rule">
                {connections.map((conn) => (
                  <li key={conn.userId} className="flex items-center justify-between gap-3 py-2">
                    <Link
                      href={routes.profile(conn.username)}
                      className="flex min-w-0 items-center gap-2.5"
                    >
                      <Avatar
                        displayName={conn.displayName}
                        username={conn.username}
                        avatarUrl={conn.avatarUrl}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {conn.displayName}
                        </p>
                        <p className="truncate font-mono text-[11px] text-ink-muted">
                          @{conn.username}
                        </p>
                      </div>
                    </Link>
                    {!conn.isOwnProfile && (
                      <Button
                        type="button"
                        size="sm"
                        variant={conn.isFollowing ? 'secondary' : 'primary'}
                        onClick={() => handleToggleConnectionFollow(conn)}
                      >
                        {conn.isFollowing ? 'Following' : 'Follow'}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Edit Profile form */}
        {editing && profile.isOwnProfile && (
          <form onSubmit={handleSaveProfile} className="space-y-4 border-t border-rule pt-4">
            <p className="font-mono text-[11px] tracking-[0.16em] text-ink-muted uppercase">
              Edit Profile
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <Avatar
                displayName={displayName || profile.displayName}
                username={username || profile.username}
                avatarUrl={avatarUrl}
                size="md"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer rounded-[var(--radius-sm)] border border-rule bg-surface px-2.5 py-1 font-mono text-[11px] text-ink hover:border-ink">
                  {avatarUrl ? 'Replace picture' : 'Upload picture'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleAvatarFile}
                    className="sr-only"
                  />
                </label>
                {avatarUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setAvatarUrl(null)}
                  >
                    Remove picture
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <LabeledInput
                label="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                error={fieldErrors.displayName?.[0]}
                maxLength={80}
                required
              />
              <LabeledInput
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                error={fieldErrors.username?.[0]}
                hint="Lowercase letters, numbers, underscores"
                maxLength={30}
                required
              />
            </div>

            <LabeledTextarea
              label="Bio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              error={fieldErrors.bio?.[0]}
              maxLength={280}
              placeholder="What are you working toward?"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <LabeledInput
                label="Location (optional)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                error={fieldErrors.location?.[0]}
                maxLength={80}
                placeholder="e.g. Boulder, CO"
              />
              <LabeledInput
                label="Personal website (optional)"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                error={fieldErrors.website?.[0]}
                maxLength={200}
                placeholder="https://example.com"
              />
            </div>

            <label className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-rule bg-surface-sunken/40 p-3">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="mt-1 accent-accent"
              />
              <span className="text-xs text-ink-muted">
                <strong className="font-medium text-ink">Private profile</strong> — Hide your goal
                statistics, public goals, and activity history from other users.
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={pending}>
                Save profile
              </Button>
            </div>
          </form>
        )}
      </Card>

      {isRestrictedView ? (
        <SocialEmptyState
          index="PRIVATE PROFILE"
          title="This profile is private"
          body="This user keeps their goals and activity history private."
        />
      ) : (
        <>
          {profile.primaryGoal ? (
            <Card padding="lg">
              <PrimaryGoalPanel
                goal={profile.primaryGoal}
                metricsHiddenFromOthers={isViewingAsOwner && profile.privacy?.showProgressMetrics === false}
              />
            </Card>
          ) : (
            isViewingAsOwner && (
              <Card padding="md">
                <p className="text-sm text-ink-muted">
                  Make a goal public to feature it here with your progress. Goals stay private until you choose.
                </p>
              </Card>
            )
          )}

          {(profile.achievements.length > 0 || isViewingAsOwner) && (
            <section aria-labelledby="achievements-heading" className="space-y-3">
              <h3
                id="achievements-heading"
                className="font-mono text-[11px] tracking-[0.18em] text-ink-muted uppercase"
              >
                Achievements ({visibleAchievements.length})
              </h3>
              {visibleAchievements.length === 0 ? (
                <Card padding="md">
                  <p className="text-sm text-ink-muted">
                    {isViewingAsOwner
                      ? 'Achievements appear here as your recorded work earns them: completing a goal, building a full plan, 30 days of progress.'
                      : 'No achievements shown yet.'}
                  </p>
                </Card>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {visibleAchievements.map((a) => (
                    <li key={a.id} className="flex">
                      <AchievementCard
                        achievement={a}
                        holder={{ displayName: profile.displayName, username: profile.username }}
                        hidden={isViewingAsOwner && a.hidden}
                        className="w-full"
                      >
                        {isViewingAsOwner && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {a.postId ? (
                              <span className="text-xs text-ink-muted">Shared with the community</span>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={pending || a.hidden}
                                onClick={() => handleShareAchievement(a)}
                              >
                                Share
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              aria-label={`${a.hidden ? 'Show' : 'Hide'} ${a.title} on my profile`}
                              onClick={() => handleAchievementHidden(a, !a.hidden)}
                            >
                              {a.hidden ? 'Show on profile' : 'Hide from profile'}
                            </Button>
                          </div>
                        )}
                      </AchievementCard>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Progress & Achievement Stats */}
          {profile.stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Goals Completed" value={profile.stats.goalsCompleted} />
              <StatTile label="Active Public Goals" value={profile.stats.activePublicGoals} />
              <StatTile label="Tasks Completed" value={profile.stats.tasksCompleted} />
              <StatTile label="Shared Updates" value={profile.stats.postsCount} />
            </div>
          )}

          {/* Owner Goal Visibility Controls */}
          {isViewingAsOwner && profile.ownGoals.length > 0 && (
            <Card padding="md" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.18em] text-ink-muted uppercase">
                    Goal Privacy Controls
                  </p>
                  <p className="text-xs text-ink-muted">
                    Goals are private by default. Choose which goals appear on your public profile.
                  </p>
                </div>
              </div>
              <ul className="divide-y divide-rule">
                {profile.ownGoals.map((g) => (
                  <li
                    key={g.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-ink">{g.title}</p>
                        <span className="rounded-[var(--radius-sm)] border border-rule px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-ink-muted uppercase">
                          {g.status}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-ink-muted">
                        {g.completedTasks}/{g.totalTasks} tasks completed
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={routes.communityShare({
                          goalId: g.id,
                          type: g.status === 'achieved' ? 'goal_completed' : 'progress_update',
                        })}
                        className="font-mono text-[11px] text-accent underline underline-offset-2 hover:text-ink"
                      >
                        Share update
                      </Link>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          handleGoalVisibilityToggle(
                            g,
                            g.visibility === 'public' ? 'private' : 'public',
                          )
                        }
                        className={`rounded-[var(--radius-sm)] border px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors ${
                          g.visibility === 'public'
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-rule bg-surface-sunken text-ink-muted hover:text-ink'
                        }`}
                      >
                        {g.visibility === 'public' ? 'Public' : 'Private'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {isViewingAsOwner && profile.privacy && (
            <Card padding="md" className="space-y-3">
              <div>
                <p className="font-mono text-[10px] tracking-[0.18em] text-ink-muted uppercase">
                  Profile privacy
                </p>
                <p className="text-xs text-ink-muted">
                  Private goals, reflections and notes are never shown, whatever you choose here.
                </p>
              </div>
              <PrivacyToggle
                label="Show my achievements"
                hint="Achievements tied to a private goal stay hidden regardless."
                checked={profile.privacy.showAchievements}
                disabled={pending}
                onChange={(v) => handlePrivacyChange('showAchievements', v)}
              />
              <PrivacyToggle
                label="Show progress figures for my featured goal"
                hint="Days pursuing, actions completed, consistency and key areas."
                checked={profile.privacy.showProgressMetrics}
                disabled={pending}
                onChange={(v) => handlePrivacyChange('showProgressMetrics', v)}
              />
              {profile.foundingMember && (
                <PrivacyToggle
                  label="Show my Founding Member badge on posts"
                  hint="Your profile always shows it."
                  checked={profile.privacy.foundingBadgeOnPosts}
                  disabled={pending}
                  onChange={(v) => handlePrivacyChange('foundingBadgeOnPosts', v)}
                />
              )}
            </Card>
          )}

          {/* Public Goals */}
          <section className="space-y-3">
            <h3 className="font-mono text-[11px] tracking-[0.18em] text-ink-muted uppercase">
              Public Goals ({profile.publicGoals.length})
            </h3>
            {profile.publicGoals.length === 0 ? (
              <Card padding="md">
                <p className="text-sm text-ink-muted">
                  {profile.isOwnProfile
                    ? 'You have not made any goals public yet. Toggle a goal to Public above to showcase it on your profile.'
                    : 'No public goals shared yet.'}
                </p>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {profile.publicGoals.map((goal) => {
                  const pct =
                    goal.totalTasks > 0
                      ? Math.min(100, Math.round((goal.completedTasks / goal.totalTasks) * 100))
                      : 0;
                  return (
                    <Card key={goal.id} padding="md" className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-serif text-lg text-ink">{goal.title}</h4>
                        <span
                          className={`shrink-0 rounded-[var(--radius-sm)] border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase ${
                            goal.status === 'achieved'
                              ? 'border-accent/40 bg-accent/10 text-accent'
                              : 'border-rule bg-surface-sunken text-ink-muted'
                          }`}
                        >
                          {goal.status === 'achieved' ? 'Completed' : 'Active'}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between font-mono text-[11px] text-ink-muted">
                          <span>
                            {goal.completedTasks}/{goal.totalTasks} tasks
                          </span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                          <div
                            className="h-full bg-accent transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Activity History */}
          <section className="space-y-3">
            <h3 className="font-mono text-[11px] tracking-[0.18em] text-ink-muted uppercase">
              Activity & Achievements
            </h3>
            {visiblePosts.length === 0 ? (
              <Card padding="md">
                <p className="text-sm text-ink-muted">No shared achievements or updates yet.</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {visiblePosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    actions={postActions}
                    onPostUpdated={(updated) =>
                      setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
                    }
                    onPostDeleted={(postId) =>
                      setPosts((prev) => prev.filter((p) => p.id !== postId))
                    }
                  />
                ))}
                {cursor && (
                  <div className="flex justify-center pt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={pending}
                      onClick={handleLoadMorePosts}
                    >
                      Load earlier activity
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>

          {isViewingAsOwner && (
            <Card padding="md" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[10px] tracking-[0.18em] text-ink-muted uppercase">
                  Blocked accounts
                </p>
                {blocked === null && (
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={handleLoadBlocked}>
                    Show
                  </Button>
                )}
              </div>
              {blocked !== null &&
                (blocked.length === 0 ? (
                  <p className="text-xs text-ink-muted">You have not blocked anyone.</p>
                ) : (
                  <ul className="divide-y divide-rule">
                    {blocked.map((b) => (
                      <li key={b.userId} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-ink">{b.displayName}</p>
                          <p className="truncate font-mono text-[11px] text-ink-muted">@{b.username}</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => handleUnblock(b)}
                        >
                          Unblock
                        </Button>
                      </li>
                    ))}
                  </ul>
                ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function PrivacyToggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-accent"
      />
      <span className="text-sm text-ink">
        {label}
        <span className="block text-xs text-ink-muted">{hint}</span>
      </span>
    </label>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card padding="md" className="space-y-1">
      <p className="font-mono text-[10px] tracking-[0.16em] text-ink-muted uppercase">{label}</p>
      <p className="font-serif text-2xl text-ink">{value}</p>
    </Card>
  );
}

function formatJoinedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}
