import { Image } from 'expo-image';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from '@/ui';

/** A profile photo (a validated JPEG data URI, never a remote URL) or the initials on paper. */
export function Avatar({ name, uri, size = 40 }: { name: string; uri: string | null | undefined; size?: number }) {
  const { colors } = useTheme();
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '·';
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentSoft,
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Text style={{ color: colors.accentOnSoft, fontSize: Math.round(size * 0.38), lineHeight: Math.round(size * 0.46) }} weight="semibold">
          {initials}
        </Text>
      )}
    </View>
  );
}
