import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, useTheme } from '@/theme';
import { Icon, Text } from '@/ui';

export type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** 'radio' for single choice, 'checkbox' for multi choice. */
  role: 'radio' | 'checkbox';
  disabled?: boolean;
};

/**
 * A stamp: hairline-ruled, small radius. Selected fills with the accent and adds a check, so
 * selection is never colour alone. The hit area is 44 pt.
 */
export function Chip({ label, selected, onPress, role, disabled = false }: ChipProps) {
  const { colors, radius, space } = useTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}
    >
      <View
        style={[
          styles.stamp,
          {
            gap: space[1],
            paddingHorizontal: space[3],
            borderRadius: radius.sm,
            borderColor: selected ? colors.accent : colors.ruleInput,
            backgroundColor: selected ? colors.accent : 'transparent',
          },
        ]}
      >
        {selected ? <Icon name="check" size={14} color={colors.accentInk} weight="semibold" /> : null}
        <Text variant="meta" weight={selected ? 'semibold' : 'medium'} style={{ color: selected ? colors.accentInk : colors.ink }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stamp: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
