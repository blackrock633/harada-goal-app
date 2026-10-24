import { router } from 'expo-router';

import { IconButton } from './IconButton';

/** Header-right control on every tab; opens the settings modal. */
export function AccountMenuButton() {
  return <IconButton accessibilityLabel="Account menu" icon="account" tone="muted" onPress={() => router.push('/settings')} />;
}
