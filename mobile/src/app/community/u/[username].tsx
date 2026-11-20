import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { errorMessage } from '@/data/errors';
import {
  blockUser,
  setAchievementVisibility,
  shareAchievement,
  useInvalidateSocial,
  useSocialProfile,
  useUserPosts,
} from '@/data/social';
import { AchievementRow, FoundingCredential, FoundingMark, PrimaryGoalSummary } from '@/features/identity/IdentityViews';
import { Avatar } from '@/features/social/Avatar';
import { FeedList } from '@/features/social/FeedList';
import { FollowButton } from '@/features/social/FollowButton';
import { ErrorScreen, LoadingScreen } from '@/screens/queryState';
import { useTheme } from '@/theme';
import { Button, EmptyState, IconButton, Section, Sheet, Text } from '@/ui';
import type { Result } from '@shared/application/result';
import { normalizeSocialProfile, type ProfileAchievementDTO, type SocialProfileDTO } from '@shared/application/social';

/** A person's public profile; your own shows Edit profile and posts only you can see. */
export default function ProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const profile = useSocialProfile(username);
  const posts = useUserPosts(profile.data && !profile.data.restricted ? profile.data.username : undefined);
  const own = !!profile.data?.isOwnProfile;

  // Your own profile is tracked as `me`, not by username, so you can change your username (and photo, in the
  // same save) and this screen still finds you when it reloads.
  useEffect(() => {
    if (own && username !== 'me') router.setParams({ username: 'me' });
  }, [own, username]);

  if (profile.isPending) return <LoadingScreen label="Loading profile" />;
  if (profile.isError) return <ErrorScreen error={profile.error} onRetry={() => void profile.refetch()} />;
  // Cached or older-server data may lack the identity fields; fill them in once here.
  const p = normalizeSocialProfile(profile.data);

  return (
    <>
      <Stack.Screen
        options={{
          title: p.displayName,
          headerRight: () =>
            p.isOwnProfile ? (
              <IconButton icon="settings" tone="muted" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
            ) : (
              <ProfileMenu profile={p} />
            ),
        }}
      />
      <FeedList
        query={posts}
        header={<ProfileHeader p={p} />}
        empty={
          p.restricted ? (
            <EmptyState title="This profile is private" message="Only the owner sees its goals and posts." />
          ) : (
            <EmptyState title="No posts yet" message={p.isOwnProfile ? 'Share progress to start your activity.' : 'Nothing shared yet.'} />
          )
        }
      />
    </>
  );
}

function ProfileHeader({ p }: { p: SocialProfileDTO }) {
  const { colors, space } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const counts: { label: string; value: number; href?: Href }[] = [
    { label: 'Followers', value: p.followersCount, href: `/community/connections?kind=followers&username=${p.username}` as Href },
    { label: 'Following', value: p.followingCount, href: `/community/connections?kind=following&username=${p.username}` as Href },
    ...(p.stats ? [{ label: 'Goals achieved', value: p.stats.goalsCompleted }, { label: 'Tasks done', value: p.stats.tasksCompleted }] : []),
  ];
  return (
    <View style={{ gap: space[5], paddingTop: space[4], paddingBottom: space[2] }}>
      <View style={[styles.row, { gap: space[4] }]}>
        <Avatar name={p.displayName} uri={p.avatarUrl} size={80} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="title" numberOfLines={2}>
            {p.displayName}
          </Text>
          <Text variant="meta" tone="muted">{`@${p.username}${p.followsViewer && !p.isOwnProfile ? ' · Follows you' : ''}`}</Text>
          {p.foundingMember ? <FoundingMark number={p.foundingMember.number} /> : null}
        </View>
      </View>
      {p.bio ? <Text>{p.bio}</Text> : null}
      {p.location ? (
        <Text variant="meta" tone="muted">
          {p.location}
        </Text>
      ) : null}
      {p.foundingMember ? <FoundingCredential number={p.foundingMember.number} since={p.foundingMember.since} /> : null}
      <View style={[styles.row, { gap: space[5], flexWrap: 'wrap' }]}>
        {counts.map((c) => (
          <Pressable
            key={c.label}
            accessibilityRole={c.href ? 'link' : 'text'}
            accessibilityLabel={`${c.value} ${c.label}`}
            disabled={!c.href || p.restricted}
            onPress={() => c.href && router.push(c.href)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text variant="headline" tabular>
              {c.value}
            </Text>
            <Text variant="caption" tone="muted">
              {c.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {p.isOwnProfile ? (
        <View style={[styles.row, { gap: space[2] }]}>
          <View style={{ flex: 1 }}>
            <Button title="Edit profile" variant="secondary" onPress={() => router.push('/community/edit-profile' as Href)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Settings" variant="secondary" icon="settings" onPress={() => router.push('/settings')} />
          </View>
        </View>
      ) : (
        <FollowButton userId={p.userId} following={p.isFollowing} name={p.displayName} onError={setError} />
      )}
      {error ? (
        <Text tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {p.primaryGoal ? (
        <Section title="Featured goal">
          <PrimaryGoalSummary goal={p.primaryGoal} hiddenFromOthers={p.isOwnProfile && p.privacy?.showProgressMetrics === false} />
        </Section>
      ) : p.isOwnProfile ? (
        <Section title="Featured goal">
          <Text variant="meta" tone="muted">
            Make a goal public to feature it here with your progress. Goals stay private until you choose.
          </Text>
        </Section>
      ) : null}
      {p.achievements.length || (p.isOwnProfile && !p.restricted) ? <Achievements p={p} onError={setError} /> : null}
      {p.publicGoals.length ? (
        <Section title="Public goals">
          <View>
            {p.publicGoals.map((g, i) => (
              <View key={g.id} style={{ paddingVertical: space[3], gap: 2, borderBottomWidth: i < p.publicGoals.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.rule }}>
                <Text variant="body" weight="semibold">
                  {g.title}
                </Text>
                <Text variant="meta" tone="muted" tabular>
                  {g.achievedAt ? 'Achieved' : g.totalTasks ? `${g.completedTasks} of ${g.totalTasks} tasks done` : `${g.outcomeCount} key areas`}
                </Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}
      {p.restricted ? null : <Text variant="caption" weight="semibold" tone="muted">ACTIVITY</Text>}
    </View>
  );
}

/** Verified achievements; on your own profile, Share (one community post each) and Hide. */
function Achievements({ p, onError }: { p: SocialProfileDTO; onError: (m: string | null) => void }) {
  const { space } = useTheme();
  const invalidate = useInvalidateSocial();
  const act = async (run: () => Promise<Result<unknown>>) => {
    onError(null);
    const res = await run();
    if (!res.ok) return onError(errorMessage(res.error));
    void invalidate();
  };
  return (
    <Section title="Achievements">
      {p.achievements.length === 0 ? (
        <Text variant="meta" tone="muted">
          Achievements appear here as your recorded work earns them: completing a goal, building a full plan, 30 days of
          progress.
        </Text>
      ) : (
        <View style={{ gap: space[2] }}>
          {p.achievements.map((a: ProfileAchievementDTO) => (
            <AchievementRow
              key={a.id}
              achievement={a}
              owner={p.isOwnProfile}
              onShare={() => void act(() => shareAchievement(a.id))}
              onToggleHidden={() => void act(() => setAchievementVisibility(a.id, !a.hidden))}
            />
          ))}
        </View>
      )}
    </Section>
  );
}

function ProfileMenu({ profile }: { profile: SocialProfileDTO }) {
  const { space } = useTheme();
  const invalidate = useInvalidateSocial();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <IconButton icon="more" tone="muted" accessibilityLabel="Profile options" onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={`Block @${profile.username}?`}>
        <View style={{ gap: space[3] }}>
          <Text>They won’t see your profile or posts, and you won’t see theirs. Follows between you are removed.</Text>
          <Button
            title="Block"
            variant="danger"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              const res = await blockUser(profile.userId);
              setBusy(false);
              if (!res.ok) return setError(errorMessage(res.error));
              setOpen(false);
              void invalidate();
              router.back();
            }}
          />
          {error ? (
            <Text tone="danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center' } });
