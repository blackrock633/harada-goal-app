import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, useTheme } from '@/theme';
import { Icon, Text } from '@/ui';

type ChoiceProps = {
  label: string;
  meta?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  divider?: boolean;
  testID?: string;
};

/**
 * One labelled choice row; the whole row is the control (44 pt+). `radio`: a circle with a dot,
 * one of a group. `checkbox`: a square with a check. Selected marks are vermilion (it is a state).
 */
function ChoiceRow({ kind, label, meta, selected, onPress, disabled, divider = true, testID }: ChoiceProps & { kind: 'radio' | 'checkbox' }) {
  const { colors, radius, space } = useTheme();
  const radio = kind === 'radio';
  return (
    <Pressable
      testID={testID}
      accessibilityRole={kind}
      accessibilityLabel={label}
      accessibilityHint={meta}
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      aria-checked={selected}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          gap: space[3],
          paddingVertical: space[2],
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
          borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: colors.rule,
        },
      ]}
    >
      <View
        style={[
          styles.mark,
          {
            borderRadius: radio ? 13 : radius.sm,
            borderColor: selected ? colors.accent : colors.ruleInput,
            backgroundColor: selected && !radio ? colors.accent : 'transparent',
          },
        ]}
      >
        {selected ? (
          radio ? (
            <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          ) : (
            <Icon name="check" size={15} color={colors.accentInk} weight="semibold" />
          )
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="medium">
          {label}
        </Text>
        {meta ? (
          <Text variant="meta" tone="muted">
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export const RadioRow = (p: ChoiceProps) => <ChoiceRow kind="radio" {...p} />;
export const CheckRow = (p: ChoiceProps) => <ChoiceRow kind="checkbox" {...p} />;

/** A label and a number on one ruled line (counts from stored data, tabular). */
export function StatRow({ label, value, divider = true }: { label: string; value: string; divider?: boolean }) {
  const { colors, space } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[
        styles.stat,
        { gap: space[3], paddingVertical: space[3], borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.rule },
      ]}
    >
      <Text variant="body" tone="muted" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="headline" tabular style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH + 12 },
  mark: { width: 26, height: 26, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  stat: { flexDirection: 'row', alignItems: 'baseline' },
});
