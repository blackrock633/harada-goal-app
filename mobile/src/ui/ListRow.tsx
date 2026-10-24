import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ListRowProps = {
  title: string;
  /** Secondary line(s) under the title. */
  meta?: string;
  /** Small icon before the meta line (e.g. routine). */
  metaIcon?: IconName;
  /** Left slot: a CheckCircle, a position number, an Icon. */
  leading?: ReactNode;
  /** Right slot: a FocusToggle, a compact Button, a value. */
  trailing?: ReactNode;
  /** Makes the text area pressable (opens the item). Leading/trailing controls stay independent. */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Strike through and mute the title (completed task). */
  done?: boolean;
  /** Hairline under the row; the last row of a list usually turns it off. */
  divider?: boolean;
  /** Show a chevron after the text when the row navigates. */
  chevron?: boolean;
  testID?: string;
};

/**
 * The one row shape for actions, reflections and settings: hairline-ruled, no card. Leading control,
 * title + meta, trailing control. Text wraps; nothing truncates silently.
 */
export function ListRow({
  title,
  meta,
  metaIcon,
  leading,
  trailing,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  done = false,
  divider = true,
  chevron = false,
  testID,
}: ListRowProps) {
  const { colors, space } = useTheme();
  const body = (
    <View style={{ gap: 2, flex: 1, paddingVertical: space[3] }}>
      <Text
        variant="body"
        weight="medium"
        tone={done ? 'muted' : 'default'}
        style={done ? { textDecorationLine: 'line-through' } : undefined}
      >
        {title}
      </Text>
      {meta ? (
        <View style={styles.meta}>
          {metaIcon ? <Icon name={metaIcon} size={13} color={colors.inkMuted} style={{ marginTop: 3 }} /> : null}
          <Text variant="meta" tone="muted" tabular style={{ flexShrink: 1 }}>
            {meta}
          </Text>
        </View>
      ) : null}
    </View>
  );
  return (
    <View
      testID={testID}
      style={[
        styles.row,
        { gap: space[2], borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.rule },
      ]}
    >
      {leading}
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? title}
          accessibilityHint={accessibilityHint}
          onPress={onPress}
          style={({ pressed }) => [styles.press, { gap: space[2], opacity: pressed ? 0.6 : 1 }]}
        >
          {body}
          {chevron ? <Icon name="forward" size={16} color={colors.inkFaint} /> : null}
        </Pressable>
      ) : (
        body
      )}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH + 12 },
  press: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  // Icon sits on the first line when the meta wraps.
  meta: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
});
