import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { SessionProvider, useSession } from '@/auth/session';
import { useAppFonts, useTheme } from '@/theme';
import { ErrorState, Screen } from '@/ui';

// Keep the native splash screen up until Fraunces + Inter are loaded.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}

function RootNavigator() {
  const { ready } = useAppFonts();
  const { colors, scheme } = useTheme();
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
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.paper },
            headerTintColor: colors.ink,
          }}
        />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
