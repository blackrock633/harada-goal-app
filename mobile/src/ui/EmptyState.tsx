import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Button } from './Button';
import type { IconName } from './Icon';
import { Text } from './Text';

export type EmptyStateProps = {
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
};

/** Says what is missing and the one step that fills it. No illustrations. */
export function EmptyState({ title, message, action }: EmptyStateProps) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space[3], paddingVertical: space[6], alignItems: 'flex-start' }}>
      <Text variant="title">{title}</Text>
      {message ? (
        <Text variant="body" tone="muted" style={{ maxWidth: 520 }}>
          {message}
        </Text>
      ) : null}
      {action ? <Button title={action.label} icon={action.icon} onPress={action.onPress} style={{ marginTop: space[2] }} /> : null}
    </View>
  );
}
