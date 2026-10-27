import { Stack } from 'expo-router';

import { useStackOptions } from '@/ui/stack-options';

/** Community: feed (index), people, notifications, profiles, follower lists, a post, editing your profile. */
export default function CommunityLayout() {
  const options = useStackOptions(false);
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'Community' }} />
      <Stack.Screen name="people" options={{ title: 'Find people' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="u/[username]" options={{ title: '' }} />
      <Stack.Screen name="connections" options={{ title: '' }} />
      <Stack.Screen name="post/[id]" options={{ title: 'Post' }} />
      <Stack.Screen name="edit-profile" options={{ title: 'Edit profile', presentation: 'modal' }} />
    </Stack>
  );
}
