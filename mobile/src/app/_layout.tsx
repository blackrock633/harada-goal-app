import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useAppFonts, useTheme } from '@/theme';

// Keep the native splash screen up until Fraunces + Inter are loaded.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { ready } = useAppFonts();
  const { colors, scheme } = useTheme();

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

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
        <Stack.Screen name="(auth)" />
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
      </Stack>
    </ThemeProvider>
  );
}
