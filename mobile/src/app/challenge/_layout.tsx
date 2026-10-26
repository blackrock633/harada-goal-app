import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

/** The 30-Day Challenge: landing and dashboard (index), completion report (complete). */
export default function ChallengeLayout() {
  const theme = useTheme();
  const { colors } = theme;
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitleStyle: { fontFamily: theme.fontFamily.display, fontSize: theme.typeScale.heading.fontSize, color: colors.ink },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      <Stack.Screen name="index" options={{ title: '30-Day Challenge' }} />
      <Stack.Screen name="complete" options={{ title: 'Challenge report' }} />
    </Stack>
  );
}
