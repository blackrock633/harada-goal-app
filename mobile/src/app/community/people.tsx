import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { usePeople } from '@/data/social';
import { PersonRow } from '@/features/social/PersonRow';
import { SkeletonLines, messageFor } from '@/screens/queryState';
import { useTheme } from '@/theme';
import { ErrorState, Screen, Section, Text, TextField } from '@/ui';

/** Search by username or name; with no search, people with public goals to follow. */
export default function PeopleScreen() {
  const { space } = useTheme();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const people = usePeople(query);
  const users = people.data?.users ?? [];

  return (
    <Screen>
      <TextField label="Search" value={text} onChangeText={setText} placeholder="Name or @username" autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
      {error ? (
        <Text tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Section title={query ? 'Results' : 'Suggested'}>
        {people.isPending ? (
          <View style={{ gap: space[4] }}>
            {[0, 1, 2].map((i) => (
              <SkeletonLines key={i} label="Loading people" widths={['50%', '30%']} />
            ))}
          </View>
        ) : people.isError ? (
          <ErrorState message={messageFor(people.error)} onRetry={() => void people.refetch()} />
        ) : users.length === 0 ? (
          <Text tone="muted">{query ? 'No one found.' : 'No suggestions yet.'}</Text>
        ) : (
          <View>
            {users.map((u, i) => (
              <PersonRow key={u.userId} person={{ ...u, line: u.publicGoalTitle }} divider={i < users.length - 1} onError={setError} />
            ))}
          </View>
        )}
      </Section>
    </Screen>
  );
}
