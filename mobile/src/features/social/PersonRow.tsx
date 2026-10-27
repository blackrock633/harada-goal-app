import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from '@/ui';

import { Avatar } from './Avatar';
import { FollowButton } from './FollowButton';

export type Person = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isOwnProfile?: boolean;
  isFollowing?: boolean;
  /** One short line under the name (a public goal, or nothing). */
  line?: string | null;
};

export const profileHref = (username: string) => `/community/u/${username}` as Href;

/** Avatar, name and @username (opens the profile), with Follow on the right. */
export function PersonRow({ person, divider = true, onError }: { person: Person; divider?: boolean; onError?: (m: string) => void }) {
  const { colors, space } = useTheme();
  return (
    <View
      style={[
        styles.row,
        { gap: space[3], paddingVertical: space[3], borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.rule },
      ]}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${person.displayName}, @${person.username}`}
        onPress={() => router.push(profileHref(person.username))}
        style={[styles.row, { flex: 1, gap: space[3] }]}
      >
        <Avatar name={person.displayName} uri={person.avatarUrl} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="body" weight="semibold" numberOfLines={1}>
            {person.displayName}
          </Text>
          <Text variant="meta" tone="muted" numberOfLines={1}>
            {`@${person.username}${person.line ? ` · ${person.line}` : ''}`}
          </Text>
        </View>
      </Pressable>
      {person.isOwnProfile ? null : (
        <FollowButton userId={person.userId} following={!!person.isFollowing} name={person.displayName} onError={onError} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center' } });
