import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type SectionProps = {
  title: string;
  /** One line under the title, when the title alone is not enough. */
  description?: string;
  /** Trailing control in the header row (a ghost Button or IconButton). */
  action?: ReactNode;
  /** Ruled: a hairline above the header, like a new block on the form. */
  ruled?: boolean;
  children?: ReactNode;
  testID?: string;
};

/** A titled group. More space above a section than inside it; no box around it. */
export function Section({ title, description, action, ruled = true, children, testID }: SectionProps) {
  const { colors, space } = useTheme();
  return (
    <View
      testID={testID}
      style={{
        gap: space[3],
        paddingTop: ruled ? space[5] : 0,
        marginTop: ruled ? space[2] : 0,
        borderTopWidth: ruled ? StyleSheet.hairlineWidth : 0,
        borderTopColor: colors.ruleStrong,
      }}
    >
      <View style={styles.header}>
        <View style={{ flex: 1, gap: space[1] }}>
          <Text variant="heading">{title}</Text>
          {description ? (
            <Text variant="meta" tone="muted">
              {description}
            </Text>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
});
