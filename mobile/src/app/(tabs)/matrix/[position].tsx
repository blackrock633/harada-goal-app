import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useMutations } from '@/data/hooks';
import { hasFeature, usePlan } from '@/data/premium';
import { KeyAreaView } from '@/features/matrix';
import { ErrorScreen, LoadingScreen } from '@/screens/queryState';
import { useGoalScreen } from '@/screens/useGoalScreen';
import { EmptyState, ErrorState, Screen, Text, useLayout } from '@/ui';

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
        <ErrorState
          title="Key area not found"
          message="Key areas are numbered 1 to 8."
          retryLabel="Back to matrix"
          onRetry={() => router.replace('/matrix')}
        />
      </Screen>
    );
  }
  return <KeyArea index={index} />;
}

function KeyArea({ index }: { index: number }) {
  const { state, detail, today, noGoals, refetchDetail } = useGoalScreen();
  const mutations = useMutations();
  // Suggestions appear once the plan is known (Pro: usable; Free: shown as Harada Pro).
  const plan = usePlan();
  const { width } = useLayout();
  const [banner, setBanner] = useState<string | null>(null);
  // The pager under the header already reads "Key area N of 8"; the header keeps only Back.
  const title = <Stack.Screen options={{ title: `Key area ${index + 1}`, headerTitle: () => null }} />;

  if (noGoals) {
    return (
      <Screen>
        {title}
        <EmptyState
          title="No goal yet"
          message="Create a goal to plan its key areas."
          action={{ label: 'Create your goal', onPress: () => router.push('/goal/new') }}
        />
      </Screen>
    );
  }
  if (state.error) return <ErrorScreen error={state.error} onRetry={state.refetch} />;
  if (state.loading || !detail || !today) return <LoadingScreen />;

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refetch} maxWidth={width >= 1024 ? 1040 : undefined}>
      {title}
      {banner ? (
        <Text tone="danger" accessibilityRole="alert">
          {banner}
        </Text>
      ) : null}
      <KeyAreaView
        goal={detail}
        position={index}
        today={today}
        matrix={mutations}
        execution={mutations}
        focus={mutations}
        // setParams merges, so ?goal= is kept.
        onNavigate={(p) => router.setParams({ position: String(p) })}
        onError={setBanner}
        onChanged={() => setBanner(null)}
        onReloadLatest={refetchDetail}
        aiPlanning={plan.data ? hasFeature(plan.data, 'ai_planning') : undefined}
      />
    </Screen>
  );
}
