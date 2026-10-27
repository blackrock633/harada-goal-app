import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useConnections } from '@/data/social';
import { PersonRow } from '@/features/social/PersonRow';
import { ErrorScreen, LoadingScreen } from '@/screens/queryState';
import { EmptyState, Screen, Text } from '@/ui';

/** /community/connections?kind=followers|following&username=… */
export default function ConnectionsScreen() {
  const params = useLocalSearchParams<{ kind?: string; username?: string }>();
  const kind = params.kind === 'following' ? 'following' : 'followers';
  const list = useConnections(kind, params.username);
  const [error, setError] = useState<string | null>(null);
  const title = kind === 'followers' ? 'Followers' : 'Following';

  if (list.isPending) return <LoadingScreen label={`Loading ${title.toLowerCase()}`} />;
  if (list.isError) return <ErrorScreen error={list.error} onRetry={() => void list.refetch()} />;
  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      {error ? (
        <Text tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {list.data.length === 0 ? (
        <EmptyState title={kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'} />
      ) : (
        <View>
          {list.data.map((u, i) => (
            <PersonRow key={u.userId} person={u} divider={i < list.data.length - 1} onError={setError} />
          ))}
        </View>
      )}
    </Screen>
  );
}
