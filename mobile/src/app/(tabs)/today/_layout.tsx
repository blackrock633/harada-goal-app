import { Stack } from 'expo-router';

import { useStackOptions, useTabRootOptions } from '@/ui/stack-options';

export default function TodayStackLayout() {
  const options = useStackOptions(true);
  const rootOptions = useTabRootOptions('Today');
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={rootOptions} />
    </Stack>
  );
}
