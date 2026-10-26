import { View } from 'react-native';

import { useTheme } from '@/theme';

/**
 * The Open Window mark (brand/open-window/harada-mark.svg) drawn with views: eight outlined
 * windows around one vermilion centre. Drawn rather than bundled so the ink follows the theme.
 */
export function HaradaMark({ size = 64 }: { size?: number }) {
  const { colors } = useTheme();
  const u = size / 96;
  const cells = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => [r, c] as const));
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      {cells.map(([r, c]) =>
        r === 1 && c === 1 ? (
          <View
            key="centre"
            style={{ position: 'absolute', left: 34 * u, top: 34 * u, width: 28 * u, height: 28 * u, borderRadius: 6 * u, backgroundColor: colors.accent }}
          />
        ) : (
          <View
            key={`${r}${c}`}
            style={{
              position: 'absolute',
              left: c * 36 * u,
              top: r * 36 * u,
              width: 24 * u,
              height: 24 * u,
              borderRadius: 6 * u,
              borderWidth: 4 * u,
              borderColor: colors.ink,
            }}
          />
        ),
      )}
    </View>
  );
}
