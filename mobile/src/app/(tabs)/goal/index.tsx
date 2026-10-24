import { Redirect, Stack, router } from 'expo-router';
import { Platform, View } from 'react-native';

import { useMutations } from '@/data/hooks';
import { GoalOverview } from '@/features/goal';
import { ErrorScreen, LoadingScreen } from '@/screens/queryState';
import { useGoalScreen } from '@/screens/useGoalScreen';

import { AccountMenuButton } from '@/ui/AccountMenuButton';
import { IconButton, Screen, useLayout } from '@/ui';

export default function GoalScreen() {
  const { state, detail, today, noGoals } = useGoalScreen();
  const mutations = useMutations();
  // Wide web hides this header (the top bar names the tab), so Edit moves into the page.
  const { wide } = useLayout();
  const inlineEdit = Platform.OS === 'web' && wide;

  if (noGoals) return <Redirect href="/goal/new" />;
  if (state.error) return <ErrorScreen error={state.error} onRetry={state.refetch} />;
  if (state.loading || !detail || !today) return <LoadingScreen />;

  const goal = detail.id;
  const edit = () => router.push({ pathname: '/goal/edit', params: { goal } });
  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refetch}>
      {inlineEdit ? null : (
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <IconButton
                accessibilityLabel="Edit goal"
                icon="edit"
                onPress={edit}
              />
              <AccountMenuButton />
            </View>
          ),
        }}
      />
      )}
      <GoalOverview
        goal={detail}
        today={today}
        activateGoal={mutations.activateGoal}
        onEdit={inlineEdit ? edit : undefined}
        onOpenMatrix={() => router.push({ pathname: '/matrix', params: { goal } })}
        onOpenArea={(position) =>
          router.push({ pathname: '/matrix/[position]', params: { position: String(position), goal } })
        }
      />
    </Screen>
  );
}
