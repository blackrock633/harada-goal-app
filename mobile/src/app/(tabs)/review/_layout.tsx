import { Stack } from 'expo-router';

import { useStackOptions, useTabRootOptions } from '@/ui/stack-options';

export default function ReviewStackLayout() {
  const options = useStackOptions(true);
  const rootOptions = useTabRootOptions('Review');
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={rootOptions} />
    </Stack>
  );
}
