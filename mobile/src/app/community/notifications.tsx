import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { markNotificationsRead, useInvalidateSocial, useNotifications } from '@/data/social';
import { Avatar } from '@/features/social/Avatar';
import { relativeTime } from '@/features/social/format';
import { profileHref } from '@/features/social/PersonRow';
import { postHref } from '@/features/social/PostCard';
import { LoadingScreen, messageFor } from '@/screens/queryState';
import { useTheme } from '@/theme';
import { EmptyState, ErrorState, Screen, Text } from '@/ui';
import type { SocialNotificationDTO } from '@shared/application/social';

const VERB: Record<SocialNotificationDTO['kind'], string> = {
  new_follower: 'started following you',
  post_liked: 'liked your post',
  post_commented: 'commented on your post',
  followed_milestone: 'shared a milestone',
};

/** Your notifications, newest first. Opening the screen marks them read. */
export default function NotificationsScreen() {
  const { colors, space } = useTheme();
  const notes = useNotifications();
  const invalidate = useInvalidateSocial();
  const unread = notes.data?.unreadCount ?? 0;

  useEffect(() => {
    if (unread > 0) void markNotificationsRead().then(() => invalidate());
    // Once the list with unread items has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread > 0]);

  if (notes.isPending) return <LoadingScreen label="Loading notifications" />;
  if (notes.isError) return <Screen><ErrorState message={messageFor(notes.error)} onRetry={() => void notes.refetch()} /></Screen>;
  const items = notes.data.items;

  return (
    <Screen>
      {items.length === 0 ? (
        <EmptyState title="No notifications" message="Follows, likes and comments show up here." />
      ) : (
        <View>
          {items.map((n, i) => (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              accessibilityLabel={`${n.actor.displayName} ${VERB[n.kind]}${n.readAt ? '' : ', new'}`}
              onPress={() => router.push(n.postId ? postHref(n.postId) : profileHref(n.actor.username))}
              style={[styles.row, { gap: space[3], paddingVertical: space[3], borderBottomWidth: i < items.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.rule }]}
            >
              <Avatar name={n.actor.displayName} uri={n.actor.avatarUrl} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="body">
                  <Text variant="body" weight="semibold">
                    {n.actor.displayName}
                  </Text>
                  {` ${VERB[n.kind]}`}
                </Text>
                {n.postHeadline ? (
                  <Text variant="meta" tone="muted" numberOfLines={1}>
                    {n.postHeadline}
                  </Text>
                ) : null}
              </View>
              <Text variant="caption" tone="muted">
                {relativeTime(n.createdAt)}
              </Text>
              {n.readAt ? null : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />}
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center' } });
