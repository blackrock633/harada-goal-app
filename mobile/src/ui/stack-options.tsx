import type { Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';

import { useTheme } from '@/theme';

import { AccountMenuButton } from './AccountMenuButton';
import { MenuButton } from './navigation';
import { useLayout } from './use-layout';

type StackOptions = NonNullable<ComponentProps<typeof Stack>['screenOptions']>;
type ScreenOptions = NonNullable<ComponentProps<typeof Stack.Screen>['options']>;

/**
 * Options for a tab's root screen. On wide web the top bar already names the tab, so the header
 * would only repeat it: hide it, or keep just its actions (`keepActions`) with no title.
 */
export function useTabRootOptions(title: string, keepActions = false): ScreenOptions {
  const { wide } = useLayout();
  // Native page roots get the menu (pages are switched by swiping or from the menu, not a tab bar).
  if (Platform.OS !== 'web') return { title, headerLeft: () => <MenuButton /> };
  if (!wide) return { title };
  return keepActions ? { title, headerTitle: () => null } : { title, headerShown: false };
}

/** Native header styling from the design tokens. `withAccountMenu` adds the header-right control. */
export function useStackOptions(withAccountMenu = false): StackOptions {
  const { colors, fontFamily, typeScale } = useTheme();
  const { wide } = useLayout();
  // The wide web top bar (tabs/_layout.web.tsx) already carries the account control.
  const showAccount = withAccountMenu && !(Platform.OS === 'web' && wide);
  return {
    headerStyle: { backgroundColor: colors.paper },
    headerTintColor: colors.ink,
    headerTitleStyle: {
      fontFamily: fontFamily.display,
      fontSize: typeScale.heading.fontSize,
      color: colors.ink,
    },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: colors.paper },
    headerRight: showAccount ? () => <AccountMenuButton /> : undefined,
  };
}
