import type { Stack } from 'expo-router';
import type { ComponentProps } from 'react';

import { useTheme } from '@/theme';

import { AccountMenuButton } from './AccountMenuButton';

type StackOptions = NonNullable<ComponentProps<typeof Stack>['screenOptions']>;

/** Native header styling from the design tokens. `withAccountMenu` adds the header-right control. */
export function useStackOptions(withAccountMenu = false): StackOptions {
  const { colors, fontFamily } = useTheme();
  return {
    headerStyle: { backgroundColor: colors.paper },
    headerTintColor: colors.ink,
    headerTitleStyle: { fontFamily: fontFamily.display, color: colors.ink },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: colors.paper },
    headerRight: withAccountMenu ? () => <AccountMenuButton /> : undefined,
  };
}
