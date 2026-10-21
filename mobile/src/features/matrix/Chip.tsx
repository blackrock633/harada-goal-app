import { Pressable } from 'react-native';

import { MIN_TOUCH, useTheme } from '@/theme';
import { Text } from '@/ui';

export type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** 'radio' for single choice, 'checkbox' for multi choice. */
  role: 'radio' | 'checkbox';
  disabled?: boolean;
};

/** Selectable chip with a 44pt target; selection is conveyed by state and a border, not colour alone. */
export function Chip({ label, selected, onPress, role, disabled = false }: ChipProps) {
  const { colors, radius, space } = useTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: MIN_TOUCH,
        minWidth: MIN_TOUCH,
        paddingHorizontal: space[3],
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.accent : colors.ruleInput,
        backgroundColor: selected ? colors.accentSoft : 'transparent',
      }}
    >
      <Text variant="meta" style={{ fontFamily: selected ? 'Inter_600SemiBold' : 'Inter_400Regular' }}>
        {label}
      </Text>
    </Pressable>
  );
}
