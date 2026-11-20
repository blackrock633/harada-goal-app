import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { useSocialProfile } from '@/data/social';
import { Avatar } from '@/features/social/Avatar';
import { MIN_TOUCH } from '@/theme';

import { IconButton } from './IconButton';

const PROFILE = '/community/u/me' as Href;

/**
 * Header-right control on every page: your profile photo (or initials), opening your profile; Settings is reached
 * from there. Shows the plain account icon until your profile has loaded, or if it can't be loaded.
 */
export function AccountMenuButton() {
  const me = useSocialProfile('me');
  if (!me.data) {
    return <IconButton accessibilityLabel="Your profile" icon="account" tone="muted" onPress={() => router.push(PROFILE)} />;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Your profile"
      onPress={() => router.push(PROFILE)}
      style={({ pressed }) => [styles.base, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Avatar name={me.data.displayName} uri={me.data.avatarUrl} size={30} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
});
