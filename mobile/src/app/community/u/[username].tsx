import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { errorMessage } from '@/data/errors';
import { blockUser, useInvalidateSocial, useSocialProfile, useUserPosts } from '@/data/social';
import { Avatar } from '@/features/social/Avatar';
import { FeedList } from '@/features/social/FeedList';
import { FollowButton } from '@/features/social/FollowButton';
import { ErrorScreen, LoadingScreen } from '@/screens/queryState';
import { useTheme } from '@/theme';
import { Button, EmptyState, IconButton, Section, Sheet, Text } from '@/ui';
import type { SocialProfileDTO } from '@shared/application/social';

/** A person's public profile; your own shows Edit profile and posts only you can see. */
export default function ProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const profile = useSocialProfile(username);
  const posts = useUserPosts(profile.data && !profile.data.restricted ? profile.data.username : undefined);

  if (profile.isPending) return <LoadingScreen label="Loading profile" />;
  if (profile.isError) return <ErrorScreen error={profile.error} onRetry={() => void profile.refetch()} />;
  const p = profile.data;

  return (
    <>
      <Stack.Screen options={{ title: p.displayName, headerRight: () => (p.isOwnProfile ? null : <ProfileMenu profile={p} />) }} />
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
        </View>
      </View>
      {p.bio ? <Text>{p.bio}</Text> : null}
      {p.location ? (
        <Text variant="meta" tone="muted">
          {p.location}
        </Text>
      ) : null}
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
        <Button title="Edit profile" variant="secondary" onPress={() => router.push('/community/edit-profile' as Href)} />
      ) : (
        <FollowButton userId={p.userId} following={p.isFollowing} name={p.displayName} onError={setError} />
      )}
      {error ? (
        <Text tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
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
