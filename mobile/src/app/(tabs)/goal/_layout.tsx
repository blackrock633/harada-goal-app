import { Stack } from 'expo-router';

import { useStackOptions } from '@/ui/stack-options';

export default function GoalStackLayout() {
  const options = useStackOptions(true);
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'My Goal' }} />
      <Stack.Screen name="new" options={{ title: 'New goal' }} />
      <Stack.Screen name="edit" options={{ title: 'Edit goal' }} />
    </Stack>
  );
}
