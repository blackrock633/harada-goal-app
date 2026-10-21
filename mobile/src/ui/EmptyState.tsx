import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

export type EmptyStateProps = {
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
};

/** Short headline, one sentence, at most one primary action. No illustrations. */
export function EmptyState({ title, message, action }: EmptyStateProps) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space[3], paddingVertical: space[8], alignItems: 'flex-start' }}>
      <Text variant="heading">{title}</Text>
      {message ? (
        <Text variant="body" tone="muted">
          {message}
        </Text>
      ) : null}
      {action ? <Button title={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}
