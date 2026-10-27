import { Stack, router, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useFeed, useNotifications, useSocialProfile } from '@/data/social';
import { Avatar } from '@/features/social/Avatar';
import { FeedList } from '@/features/social/FeedList';
import { profileHref } from '@/features/social/PersonRow';
import { useTheme } from '@/theme';
import { Badge, Button, EmptyState, IconButton, SegmentedControl } from '@/ui';
import { Pressable } from 'react-native';

const SCOPES = [
  { value: 'following', label: 'Following' },
  { value: 'explore', label: 'Explore' },
] as const;

/** The activity feed: newest first, from people you follow (or everyone public, in Explore). */
export default function CommunityFeed() {
  const { space } = useTheme();
  const [scope, setScope] = useState<'following' | 'explore'>('following');
  const feed = useFeed(scope);
  const me = useSocialProfile('me');
  const notes = useNotifications();
  const unread = notes.data?.unreadCount ?? 0;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <IconButton icon="search" tone="muted" accessibilityLabel="Find people" onPress={() => router.push('/community/people' as Href)} />
              <View>
                <IconButton
                  icon="bell"
                  tone="muted"
                  accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
                  onPress={() => router.push('/community/notifications' as Href)}
                />
                {unread ? (
                  <View pointerEvents="none" style={{ position: 'absolute', top: 4, right: 2 }}>
                    <Badge text={unread > 9 ? '9+' : String(unread)} tone="accent" />
                  </View>
                ) : null}
              </View>
              {me.data ? (
                <Pressable accessibilityRole="link" accessibilityLabel="Your profile" onPress={() => router.push(profileHref(me.data!.username))} style={{ padding: 6 }}>
                  <Avatar name={me.data.displayName} uri={me.data.avatarUrl} size={30} />
                </Pressable>
              ) : null}
            </View>
          ),
        }}
      />
      <FeedList
        query={feed}
        header={
          <View style={{ gap: space[3], paddingTop: space[3], paddingBottom: space[1] }}>
            <SegmentedControl label="Feed" options={SCOPES} value={scope} onChange={setScope} />
            <Button title="Share progress" variant="secondary" onPress={() => router.push('/share' as Href)} />
          </View>
        }
        empty={
          scope === 'following' ? (
            <EmptyState
              title="Nothing here yet"
              message="Follow people to see their goals and progress."
              action={{ label: 'Find people', onPress: () => router.push('/community/people' as Href) }}
            />
          ) : (
            <EmptyState title="No public posts yet" message="Be the first to share progress." action={{ label: 'Share progress', onPress: () => router.push('/share' as Href) }} />
          )
        }
      />
    </>
  );
}
