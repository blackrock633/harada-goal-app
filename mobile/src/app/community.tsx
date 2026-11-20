import { useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { isSelfReportedPostType } from '@shared/application/achievements';

import {
  addPostComment,
  createSocialPost,
  discoverUsers,
  fetchSocialFeed,
  fetchSocialProfile,
  followUser,
  listBlockedUsers,
  listSocialNotifications,
  markNotificationsRead,
  setAchievementVisibility,
  setGoalVisibility,
  shareAchievement,
  togglePostLike,
  unblockUser,
  unfollowUser,
  updateSocialProfile,
} from '@/data/social';
import {
  AchievementRow,
  FoundingCredential,
  FoundingMark,
  PrimaryGoalSummary,
} from '@/features/identity/IdentityViews';
import { useTheme } from '@/theme';
import {
  Badge,
  Button,
  EmptyState,
  ListRow,
  Screen,
  Section,
  SegmentedControl,
  Text,
  TextField,
} from '@/ui';
import type {
  BlockedUserDTO,
  DiscoverResultDTO,
  ProfileAchievementDTO,
  ProfilePrivacyDTO,
  SocialFeedDTO,
  SocialNotificationsListDTO,
  SocialPostDTO,
  SocialProfileDTO,
} from '@shared/application/social';

type TabKey = 'feed' | 'discover' | 'notifications' | 'profile';

const TAB_SEGMENTS: { value: TabKey; label: string }[] = [
  { value: 'feed', label: 'Feed' },
  { value: 'discover', label: 'Discover' },
  { value: 'notifications', label: 'Activity' },
  { value: 'profile', label: 'Profile' },
];

export default function CommunityScreen() {
  const { colors, space } = useTheme();
  const [tab, setTab] = useState<TabKey>('feed');
  const [feed, setFeed] = useState<SocialFeedDTO>({
    items: [],
    nextCursor: null,
    followingCount: 0,
  });
  const [discover, setDiscover] = useState<DiscoverResultDTO>({
    users: [],
    recentAchievements: [],
  });
  const [notifications, setNotifications] = useState<SocialNotificationsListDTO>({
    items: [],
    unreadCount: 0,
  });
  const [profile, setProfile] = useState<SocialProfileDTO | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [composeHeadline, setComposeHeadline] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [showComposer, setShowComposer] = useState(false);

  // Profile edit state
  const [editingProfile, setEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<BlockedUserDTO[] | null>(null);

  useEffect(() => {
    void loadInitial();
  }, []);

  async function loadInitial() {
    const [feedRes, discRes, notifRes, profRes] = await Promise.all([
      fetchSocialFeed({ scope: 'following', limit: 20 }),
      discoverUsers('', 16),
      listSocialNotifications(20),
      fetchSocialProfile({}),
    ]);
    if (feedRes.ok) setFeed(feedRes.data);
    if (discRes.ok) setDiscover(discRes.data);
    if (notifRes.ok) setNotifications(notifRes.data);
    if (profRes.ok) {
      setProfile(profRes.data);
      setDisplayName(profRes.data.displayName);
      setUsername(profRes.data.username);
      setBio(profRes.data.bio);
    }
  }

  async function handlePublishPost() {
    if (!composeHeadline.trim() && !composeBody.trim()) return;
    const res = await createSocialPost({
      type: 'progress_update',
      visibility: 'public',
      headline: composeHeadline.trim() || undefined,
      body: composeBody.trim() || undefined,
    });
    if (res.ok) {
      setFeed((prev) => ({ ...prev, items: [res.data, ...prev.items] }));
      setComposeHeadline('');
      setComposeBody('');
      setShowComposer(false);
    } else {
      setStatusMessage(res.error.message);
    }
  }

  async function handleLike(post: SocialPostDTO) {
    const res = await togglePostLike(post.id);
    if (res.ok) {
      setFeed((prev) => ({
        ...prev,
        items: prev.items.map((p) =>
          p.id === post.id
            ? { ...p, likedByViewer: res.data.liked, likeCount: res.data.likeCount }
            : p,
        ),
      }));
    }
  }

  async function handleSearch() {
    const res = await discoverUsers(searchQuery, 20);
    if (res.ok) setDiscover(res.data);
  }

  async function handleFollowToggle(userId: string, currentlyFollowing: boolean) {
    const res = currentlyFollowing ? await unfollowUser(userId) : await followUser(userId);
    if (res.ok) {
      setDiscover((prev) => ({
        ...prev,
        users: prev.users.map((u) =>
          u.userId === userId ? { ...u, isFollowing: !currentlyFollowing } : u,
        ),
      }));
    }
  }

  async function handlePrivacy(key: keyof ProfilePrivacyDTO, value: boolean) {
    const res = await updateSocialProfile({ [key]: value });
    if (res.ok) setProfile(res.data);
    else setStatusMessage(res.error.message);
  }

  async function handleShareAchievement(a: ProfileAchievementDTO) {
    const res = await shareAchievement(a.id);
    if (!res.ok) {
      setStatusMessage(res.error.message);
      return;
    }
    setProfile((prev) =>
      prev
        ? { ...prev, achievements: prev.achievements.map((x) => (x.id === a.id ? { ...x, postId: res.data.id } : x)) }
        : prev,
    );
    setFeed((prev) => ({ ...prev, items: [res.data, ...prev.items.filter((p) => p.id !== res.data.id)] }));
    setStatusMessage(`Shared ${a.title} with the community`);
  }

  async function handleToggleAchievement(a: ProfileAchievementDTO) {
    const res = await setAchievementVisibility(a.id, !a.hidden);
    if (!res.ok) {
      setStatusMessage(res.error.message);
      return;
    }
    setProfile((prev) =>
      prev
        ? { ...prev, achievements: prev.achievements.map((x) => (x.id === a.id ? { ...x, hidden: !a.hidden } : x)) }
        : prev,
    );
  }

  async function handleLoadBlocked() {
    const res = await listBlockedUsers();
    if (res.ok) setBlocked(res.data.items);
    else setStatusMessage(res.error.message);
  }

  async function handleUnblock(user: BlockedUserDTO) {
    const res = await unblockUser(user.userId);
    if (res.ok) setBlocked((prev) => (prev ?? []).filter((b) => b.userId !== user.userId));
    else setStatusMessage(res.error.message);
  }

  async function handleSaveProfile() {
    const res = await updateSocialProfile({ displayName, username, bio });
    if (res.ok) {
      setProfile(res.data);
      setEditingProfile(false);
      setStatusMessage('Profile saved');
    } else {
      setStatusMessage(res.error.message);
    }
  }

  return (
    <Screen>
      <View style={{ gap: space[4] }}>
        <SegmentedControl<TabKey>
          label="Community section"
          options={TAB_SEGMENTS}
          value={tab}
          onChange={setTab}
        />

        {statusMessage ? (
          <Text variant="meta" tone="muted">
            {statusMessage}
          </Text>
        ) : null}

        {tab === 'feed' && (
          <View style={{ gap: space[4] }}>
            <View style={{ alignItems: 'flex-start' }}>
              <Button
                title={showComposer ? 'Close composer' : 'Share progress update'}
                variant={showComposer ? 'secondary' : 'primary'}
                size="compact"
                onPress={() => setShowComposer((v) => !v)}
              />
            </View>

            {showComposer && (
              <Section title="Share an update">
                <TextField
                  label="Headline"
                  value={composeHeadline}
                  onChangeText={setComposeHeadline}
                  placeholder="e.g. Completed 14 straight days of key area #1"
                />
                <TextField
                  label="Details"
                  value={composeBody}
                  onChangeText={setComposeBody}
                  multiline
                  placeholder="What progress did you make today?"
                />
                <View style={{ alignItems: 'flex-start' }}>
                  <Button title="Publish update" onPress={() => void handlePublishPost()} />
                </View>
              </Section>
            )}

            {feed.items.length === 0 ? (
              <EmptyState
                title="Your community feed is quiet"
                message="Follow people in Discover or share your first milestone to start building momentum together."
                action={{
                  label: 'Find people to follow',
                  onPress: () => setTab('discover'),
                }}
              />
            ) : (
              <Section title="Recent activity">
                <View style={{ gap: space[3] }}>
                  {feed.items.map((post) => (
                    <MobilePostItem
                      key={post.id}
                      post={post}
                      onLike={() => void handleLike(post)}
                      colors={colors}
                      space={space}
                    />
                  ))}
                </View>
              </Section>
            )}
          </View>
        )}

        {tab === 'discover' && (
          <View style={{ gap: space[4] }}>
            <Section title="Find people">
              <TextField
                label="Search by username or display name"
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search @username…"
              />
              <View style={{ alignItems: 'flex-start' }}>
                <Button title="Search" size="compact" onPress={() => void handleSearch()} />
              </View>
            </Section>

            <Section title="Recommended">
              {discover.users.length === 0 ? (
                <Text tone="muted">No matching members found.</Text>
              ) : (
                <View>
                  {discover.users.map((u, idx) => (
                    <ListRow
                      key={u.userId}
                      title={`${u.displayName} (@${u.username})`}
                      meta={u.publicGoalTitle ? `Goal: ${u.publicGoalTitle}` : u.reason}
                      divider={idx < discover.users.length - 1}
                      trailing={
                        !u.isOwnProfile ? (
                          <Button
                            title={u.isFollowing ? 'Following' : 'Follow'}
                            variant={u.isFollowing ? 'secondary' : 'primary'}
                            size="compact"
                            onPress={() => void handleFollowToggle(u.userId, u.isFollowing)}
                          />
                        ) : undefined
                      }
                    />
                  ))}
                </View>
              )}
            </Section>
          </View>
        )}

        {tab === 'notifications' && (
          <Section title={`Notifications (${notifications.unreadCount} unread)`}>
            {notifications.unreadCount > 0 && (
              <View style={{ alignItems: 'flex-start' }}>
                <Button
                  title="Mark all read"
                  variant="secondary"
                  size="compact"
                  onPress={async () => {
                    await markNotificationsRead();
                    setNotifications((prev) => ({ ...prev, unreadCount: 0 }));
                  }}
                />
              </View>
            )}
            {notifications.items.length === 0 ? (
              <Text tone="muted">No notifications yet.</Text>
            ) : (
              <View>
                {notifications.items.map((n, idx) => (
                  <ListRow
                    key={n.id}
                    title={`${n.actor.displayName} (@${n.actor.username})`}
                    meta={
                      n.kind === 'new_follower'
                        ? 'Started following you'
                        : n.kind === 'post_liked'
                          ? `Liked your post${n.postHeadline ? `: ${n.postHeadline}` : ''}`
                          : `Commented on your post`
                    }
                    divider={idx < notifications.items.length - 1}
                    trailing={!n.readAt ? <Badge text="New" /> : undefined}
                  />
                ))}
              </View>
            )}
          </Section>
        )}

        {tab === 'profile' && profile && (
          <View style={{ gap: space[4] }}>
            <Section
              title={`${profile.displayName} (@${profile.username})`}
              description={profile.bio || 'No bio added yet.'}
            >
              <Text variant="meta" tone="muted">
                {profile.followersCount} Followers · {profile.followingCount} Following ·{' '}
                {profile.stats?.goalsCompleted ?? 0} Goals Completed
              </Text>
              <View style={{ alignItems: 'flex-start' }}>
                <Button
                  title={editingProfile ? 'Cancel' : 'Edit Profile'}
                  variant="secondary"
                  size="compact"
                  onPress={() => setEditingProfile((v) => !v)}
                />
              </View>

              {editingProfile && (
                <View style={{ gap: space[3] }}>
                  <TextField
                    label="Display name"
                    value={displayName}
                    onChangeText={setDisplayName}
                  />
                  <TextField
                    label="Username"
                    value={username}
                    onChangeText={(t) => setUsername(t.toLowerCase())}
                    autoCapitalize="none"
                  />
                  <TextField
                    label="Bio"
                    value={bio}
                    onChangeText={setBio}
                    multiline
                  />
                  <View style={{ alignItems: 'flex-start' }}>
                    <Button title="Save profile" size="compact" onPress={() => void handleSaveProfile()} />
                  </View>
                </View>
              )}
            </Section>

            {profile.foundingMember ? (
              <FoundingCredential number={profile.foundingMember.number} since={profile.foundingMember.since} />
            ) : null}

            <Section title="Featured goal">
              {profile.primaryGoal ? (
                <PrimaryGoalSummary
                  goal={profile.primaryGoal}
                  hiddenFromOthers={profile.privacy?.showProgressMetrics === false}
                />
              ) : (
                <Text variant="meta" tone="muted">
                  Make a goal public to feature it on your profile with your progress. Goals stay private until you
                  choose.
                </Text>
              )}
            </Section>

            <Section title="Achievements">
              {profile.achievements.length === 0 ? (
                <Text variant="meta" tone="muted">
                  Achievements appear here as your recorded work earns them: completing a goal, building a full plan,
                  30 days of progress.
                </Text>
              ) : (
                <View style={{ gap: space[2] }}>
                  {profile.achievements.map((a) => (
                    <AchievementRow
                      key={a.id}
                      achievement={a}
                      owner
                      onShare={() => void handleShareAchievement(a)}
                      onToggleHidden={() => void handleToggleAchievement(a)}
                    />
                  ))}
                </View>
              )}
            </Section>

            {profile.privacy ? (
              <Section
                title="Profile privacy"
                description="Private goals, reflections and notes are never shown, whatever you choose here."
              >
                <PrivacySwitch
                  label="Show my achievements"
                  value={profile.privacy.showAchievements}
                  onChange={(v) => void handlePrivacy('showAchievements', v)}
                />
                <PrivacySwitch
                  label="Show progress figures for my featured goal"
                  value={profile.privacy.showProgressMetrics}
                  onChange={(v) => void handlePrivacy('showProgressMetrics', v)}
                />
                {profile.foundingMember ? (
                  <PrivacySwitch
                    label="Show my Founding Member badge on posts"
                    value={profile.privacy.foundingBadgeOnPosts}
                    onChange={(v) => void handlePrivacy('foundingBadgeOnPosts', v)}
                  />
                ) : null}
              </Section>
            ) : null}

            <Section
              title="Blocked accounts"
              action={
                blocked === null ? (
                  <Button title="Show" size="compact" variant="ghost" onPress={() => void handleLoadBlocked()} />
                ) : undefined
              }
            >
              {blocked === null ? null : blocked.length === 0 ? (
                <Text variant="meta" tone="muted">
                  You have not blocked anyone.
                </Text>
              ) : (
                <View>
                  {blocked.map((b, idx) => (
                    <ListRow
                      key={b.userId}
                      title={b.displayName}
                      meta={`@${b.username}`}
                      divider={idx < blocked.length - 1}
                      trailing={
                        <Button
                          title="Unblock"
                          size="compact"
                          variant="secondary"
                          onPress={() => void handleUnblock(b)}
                        />
                      }
                    />
                  ))}
                </View>
              )}
            </Section>

            {profile.ownGoals.length > 0 && (
              <Section
                title="Goal privacy controls"
                description="Goals are private by default. Choose which goals appear on your public profile."
              >
                <View>
                  {profile.ownGoals.map((g, idx) => (
                    <ListRow
                      key={g.id}
                      title={g.title}
                      meta={`${g.completedTasks}/${g.totalTasks} tasks · ${
                        g.visibility === 'public' ? 'Public on profile' : 'Private'
                      }`}
                      divider={idx < profile.ownGoals.length - 1}
                      trailing={
                        <Button
                          title={g.visibility === 'public' ? 'Make Private' : 'Make Public'}
                          variant="secondary"
                          size="compact"
                          onPress={async () => {
                            const nextVis = g.visibility === 'public' ? 'private' : 'public';
                            const res = await setGoalVisibility({
                              goalId: g.id,
                              visibility: nextVis,
                            });
                            if (res.ok) {
                              setProfile((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      ownGoals: prev.ownGoals.map((og) =>
                                        og.id === g.id ? { ...og, visibility: nextVis } : og,
                                      ),
                                    }
                                  : prev,
                              );
                            }
                          }}
                        />
                      }
                    />
                  ))}
                </View>
              </Section>
            )}
          </View>
        )}
      </View>
    </Screen>
  );
}

function MobilePostItem({
  post,
  onLike,
  colors,
  space,
}: {
  post: SocialPostDTO;
  onLike: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  space: ReturnType<typeof useTheme>['space'];
}) {
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState(post.recentComments);

  async function submitComment() {
    if (!commentText.trim()) return;
    const res = await addPostComment(post.id, commentText.trim());
    if (res.ok) {
      setComments((prev) => [...prev, res.data.comment]);
      setCommentText('');
    }
  }

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.rule,
        padding: space[3],
        gap: space[2],
      }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
        <Text weight="medium">
          {post.author.displayName} (@{post.author.username})
        </Text>
        {post.author.foundingMemberNumber != null ? <FoundingMark number={post.author.foundingMemberNumber} /> : null}
      </View>
      {isSelfReportedPostType(post.type) ? (
        <Text variant="caption" tone="muted">
          Self-reported
        </Text>
      ) : null}
      {post.achievement ? (
        <Text variant="caption" tone="muted">
          Achievement · Verified from activity recorded in Harada
        </Text>
      ) : null}
      {post.goal ? (
        <Text variant="meta" tone="muted">
          Goal: {post.goal.title}
        </Text>
      ) : null}
      {post.headline ? <Text variant="heading">{post.headline}</Text> : null}
      {post.body ? <Text>{post.body}</Text> : null}
      <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
        <Pressable onPress={onLike} accessibilityRole="button" accessibilityLabel="Like post">
          <Text variant="meta" tone={post.likedByViewer ? 'accent' : 'muted'}>
            {post.likedByViewer ? '♥' : '♡'} {post.likeCount} Likes
          </Text>
        </Pressable>
        <Text variant="meta" tone="muted">
          {comments.length} Comments
        </Text>
      </View>
      {comments.map((c) => (
        <Text key={c.id} variant="meta">
          @{c.author.username}: {c.body}
        </Text>
      ))}
      <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Comment"
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Write an encouraging note…"
          />
        </View>
        <Button title="Post" size="compact" variant="secondary" onPress={() => void submitComment()} />
      </View>
    </View>
  );
}

function PrivacySwitch({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}
