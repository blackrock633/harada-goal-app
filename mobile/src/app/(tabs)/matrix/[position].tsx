import { Stack, useLocalSearchParams } from 'expo-router';

import { EmptyState, ErrorState, Screen } from '@/ui';

/** Parses a key-area position (0..7); returns null when invalid. */
export function parsePosition(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null || !/^[0-7]$/.test(value)) return null;
  return Number(value);
}

export default function KeyAreaScreen() {
  const { position } = useLocalSearchParams<{ position: string }>();
  const index = parsePosition(position);

  if (index == null) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Key area' }} />
        <ErrorState title="Key area not found" message="Key areas are numbered 1 to 8." />
      </Screen>
    );
  }
  return (
    <Screen>
      <Stack.Screen options={{ title: `Key area ${index + 1}` }} />
      <EmptyState title="No key area yet" message="This key area and its eight actions will appear here." />
    </Screen>
  );
}
