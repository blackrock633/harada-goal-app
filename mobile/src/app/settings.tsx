import { router } from 'expo-router';

import { Button, Screen, Text } from '@/ui';

export default function SettingsScreen() {
  return (
    <Screen>
      <Text variant="title">Settings</Text>
      <Text tone="muted">Account and appearance preferences will live here.</Text>
      <Button
        title="Sign out"
        variant="danger"
        onPress={() => {
          // Sign-out logic is not wired yet; just dismiss the modal.
          if (router.canGoBack()) router.back();
        }}
      />
    </Screen>
  );
}
