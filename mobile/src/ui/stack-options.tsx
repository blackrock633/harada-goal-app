import type { Stack } from 'expo-router';
import type { ComponentProps, ReactElement } from 'react';
import { Platform, View } from 'react-native';

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
    ...(showAccount ? headerRightWithAccount() : {}),
  };
}

/**
 * Header-right items ending with your profile photo, optionally preceded by one screen action. On iOS 26 the
 * photo is drawn on its own, without the glass background the system puts behind header buttons. UIKit lays out
 * right items from the edge inwards, so the photo is listed first to stay in the corner.
 */
export function headerRightWithAccount(action?: ReactElement): ScreenOptions {
  if (Platform.OS === 'ios') {
    return {
      unstable_headerRightItems: () => [
        { type: 'custom', element: <AccountMenuButton />, hidesSharedBackground: true },
        ...(action ? [{ type: 'custom' as const, element: action }] : []),
      ],
    };
  }
  return {
    headerRight: () => (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {action}
        <AccountMenuButton />
      </View>
    ),
  };
}
