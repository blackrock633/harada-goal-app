import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, useTheme } from '@/theme';

import { Text } from './Text';

export type SegmentedControlProps<T extends string> = {
  /** Accessible name for the group. */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
};

/** Mutually exclusive choice among 2-4 short options (task / routine, daily / weekly). */
export function SegmentedControl<T extends string>({ label, options, value, onChange, testID }: SegmentedControlProps<T>) {
  const { colors, radius, space } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.track, { backgroundColor: colors.surfaceSunken, borderRadius: radius.md, padding: 2 }]}
      // 2 pt track padding on each side + segment height = MIN_TOUCH.
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected, checked: selected }}
            aria-checked={selected}
            onPress={() => onChange(o.value)}
            style={[
              styles.segment,
              {
                borderRadius: radius.md - 2,
                paddingHorizontal: space[4],
                backgroundColor: selected ? colors.surface : 'transparent',
                borderColor: selected ? colors.rule : 'transparent',
              },
            ]}
          >
            <Text variant="meta" weight={selected ? 'semibold' : 'medium'} tone={selected ? 'default' : 'muted'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', alignSelf: 'flex-start' },
  segment: { minHeight: MIN_TOUCH - 4, flexGrow: 1, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
});
