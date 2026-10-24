import { Stack } from 'expo-router';

import { useStackOptions, useTabRootOptions } from '@/ui/stack-options';

export default function MatrixStackLayout() {
  const options = useStackOptions(true);
  const rootOptions = useTabRootOptions('Matrix');
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={rootOptions} />
      <Stack.Screen name="[position]" options={{ title: 'Key area' }} />
    </Stack>
  );
}
