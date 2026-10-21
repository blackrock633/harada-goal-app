import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';

import { useTheme } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

export type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
}: ErrorStateProps) {
  const { space } = useTheme();
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message ? `${title}. ${message}` : title);
  }, [title, message]);
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: space[3], paddingVertical: space[8], alignItems: 'flex-start' }}>
      <Text variant="heading">{title}</Text>
      {message ? (
        <Text variant="body" tone="muted">
          {message}
        </Text>
      ) : null}
      {onRetry ? <Button title={retryLabel} variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}
