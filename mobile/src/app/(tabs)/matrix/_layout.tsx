import { Stack } from 'expo-router';

import { useStackOptions } from '@/ui/stack-options';

export default function MatrixStackLayout() {
  const options = useStackOptions(true);
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'Matrix' }} />
      <Stack.Screen name="[position]" options={{ title: 'Key area' }} />
    </Stack>
  );
}
