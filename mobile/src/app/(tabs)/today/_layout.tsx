import { Stack } from 'expo-router';

import { useStackOptions } from '@/ui/stack-options';

export default function TodayStackLayout() {
  const options = useStackOptions(true);
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'Today' }} />
    </Stack>
  );
}
