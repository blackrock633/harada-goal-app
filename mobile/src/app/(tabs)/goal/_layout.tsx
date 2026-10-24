import { Stack } from 'expo-router';

import { useStackOptions, useTabRootOptions } from '@/ui/stack-options';

export default function GoalStackLayout() {
  const options = useStackOptions(true);
  const rootOptions = useTabRootOptions('My Goal');
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={rootOptions} />
      <Stack.Screen name="new" options={{ title: 'New goal' }} />
      <Stack.Screen name="edit" options={{ title: 'Edit goal' }} />
    </Stack>
  );
}
