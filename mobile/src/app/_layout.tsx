import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SessionProvider, useSession } from '@/auth/session';
import { QueryProvider } from '@/data/query-provider';
import { useAppFonts, useTheme } from '@/theme';
import { ErrorState, IconButton, Screen } from '@/ui';
import { installWebSurfaces } from '@/ui/web-surfaces';

// Keep the native splash screen up until the display face is loaded.
SplashScreen.preventAutoHideAsync();
installWebSurfaces();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <QueryProvider>
          <RootNavigator />
        </QueryProvider>
      </SessionProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { ready } = useAppFonts();
  const theme = useTheme();
  const { colors, scheme } = theme;
  const session = useSession();
  // Keep the splash up until fonts AND the stored session are known, so guards never evaluate
  // against a not-yet-loaded session (which would flash the sign-in screen).
  const settled = ready && session.status !== 'loading';

  useEffect(() => {
    if (settled) SplashScreen.hide();
  }, [settled]);

  if (!settled) return null;
  if (session.status === 'misconfigured') {
    return (
      <Screen>
        <ErrorState
          title="Harada isn't configured"
          message="This build has no Supabase project configured, so it can't sign you in. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY and rebuild."
        />
      </Screen>
    );
  }
  const signedIn = session.status === 'signedIn';

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.paper,
      card: colors.paper,
      text: colors.ink,
      border: colors.rule,
      primary: colors.accent,
    },
  };

  // Header style shared by the stacked screens (same as Settings).
  const pushed = {
    headerShown: true,
    headerTitleStyle: { fontFamily: theme.fontFamily.display, fontSize: theme.typeScale.heading.fontSize, color: colors.ink },
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.paper },
    headerTintColor: colors.ink,
  } as const;

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        {/* Client-side routing only; RLS and the RPCs are the real access control. */}
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
          name="settings"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: 'Settings',
            headerTitleStyle: { fontFamily: theme.fontFamily.display, fontSize: theme.typeScale.heading.fontSize, color: colors.ink },
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.paper },
            headerTintColor: colors.ink,
          }}
        />
          {/* Harada Pro, history, the 30-Day Challenge and sharing (premium.ts). */}
          <Stack.Screen
            name="upgrade"
            options={{
              ...pushed,
              // The paywall covers the whole screen; Close is the only way back.
              presentation: 'fullScreenModal',
              title: '',
              headerLeft: () => <IconButton icon="close" accessibilityLabel="Close" tone="muted" onPress={() => router.back()} />,
            }}
          />
          <Stack.Screen name="insights" options={{ ...pushed, title: 'Progress history' }} />
          <Stack.Screen name="share" options={{ ...pushed, presentation: 'modal', title: 'Share progress' }} />
          <Stack.Screen name="share-card" options={{ ...pushed, presentation: 'modal', title: 'Share as an image' }} />
          <Stack.Screen name="community" options={{ headerShown: false }} />
          <Stack.Screen name="challenge" />
          <Stack.Screen name="menu" options={{ ...pushed, presentation: 'modal', title: 'Menu' }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
