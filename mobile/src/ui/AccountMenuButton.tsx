import { router } from 'expo-router';

import { IconButton } from './IconButton';

/** Header-right control on every tab; opens the settings modal. */
export function AccountMenuButton() {
  return <IconButton accessibilityLabel="Account menu" onPress={() => router.push('/settings')} />;
}
