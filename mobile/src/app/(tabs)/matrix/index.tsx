import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';
import { EmptyState, Screen, Text } from '@/ui';

const POSITIONS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export default function MatrixScreen() {
  const { colors } = useTheme();
  return (
    <Screen>
      <EmptyState title="The matrix is empty" message="Your eight key areas and their actions will appear here." />
      <View>
        {POSITIONS.map((p) => (
          <Link
            key={p}
            href={{ pathname: '/matrix/[position]', params: { position: String(p) } }}
            accessibilityRole="link"
            accessibilityLabel={`Key area ${p + 1}`}
            style={[styles.row, { borderBottomColor: colors.rule }]}
          >
            <Text>{`Key area ${p + 1}`}</Text>
          </Link>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 48, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
