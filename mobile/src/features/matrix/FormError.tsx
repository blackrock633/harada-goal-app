import { View } from 'react-native';

import { errorMessage, isConflict } from '@/data/errors';
import { Button, Text } from '@/ui';
import { useTheme } from '@/theme';
import type { AppError } from '@shared/application/result';

/** A mutation failure shown with the shared wording; offers "Reload latest" on CONFLICT. */
export interface FormFailure {
  message: string;
  conflict: boolean;
}

export function toFailure(error: AppError): FormFailure {
  return { message: errorMessage(error), conflict: isConflict(error) };
}

export function FormError({ failure, onReloadLatest }: { failure: FormFailure; onReloadLatest?: () => void }) {
  const { colors, radius, space } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        borderWidth: 1,
        borderColor: colors.danger,
        borderRadius: radius.sm,
        padding: space[3],
        gap: space[2],
      }}
    >
      <Text variant="meta" tone="danger" style={{ flexShrink: 1 }}>
        {failure.message}
      </Text>
      {failure.conflict && onReloadLatest ? (
        <Button title="Reload latest" variant="secondary" onPress={onReloadLatest} />
      ) : null}
    </View>
  );
}
