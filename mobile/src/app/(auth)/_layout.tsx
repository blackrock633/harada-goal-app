import { Stack } from 'expo-router';

import { useStackOptions } from '@/ui/stack-options';

export default function AuthLayout() {
  const options = useStackOptions();
  return (
    <Stack screenOptions={{ ...options, headerShown: false }}>
      <Stack.Screen name="signin" options={{ title: 'Sign in' }} />
      <Stack.Screen name="signup" options={{ title: 'Create account' }} />
    </Stack>
  );
}
