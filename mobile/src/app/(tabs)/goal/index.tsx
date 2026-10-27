import { Redirect, Stack, router } from 'expo-router';
import { Platform, View } from 'react-native';

import { useGoals, useMutations } from '@/data/hooks';
import { usePlan } from '@/data/premium';
import { GoalOverview } from '@/features/goal';
import { OverLimitNotice } from '@/features/premium/ChooseActiveGoal';
import { GoalsPanel } from '@/features/premium/GoalsPanel';
import { insightsHref, shareHref } from '@/features/premium/routes';
import { ErrorScreen, LoadingScreen } from '@/screens/queryState';
import { useGoalScreen } from '@/screens/useGoalScreen';

import { AccountMenuButton } from '@/ui/AccountMenuButton';
import { IconButton, Screen, useLayout } from '@/ui';

export default function GoalScreen() {
  const { state, detail, today, noGoals } = useGoalScreen();
  const mutations = useMutations();
  const goals = useGoals();
  // Plan-dependent extras never hold up the screen: until the plan loads they show as Free.
  const plan = usePlan();
  // Wide web hides this header (the top bar names the tab), so Edit moves into the page.
  const { wide } = useLayout();
  const inlineEdit = Platform.OS === 'web' && wide;

  // Only archived goals left: offer to restore one or start a new one, instead of hiding them behind "new goal".
  const archivedOnly = noGoals && (goals.data ?? []).some((g) => g.status === 'archived');
  if (noGoals && !archivedOnly) return <Redirect href="/goal/new" />;
  if (archivedOnly) {
    return (
      <Screen>
        <GoalsPanel
          goals={goals.data ?? []}
          currentId={null}
          plan={plan.data}
          restoreGoal={mutations.restoreGoal}
          onOpenGoal={(id) => router.setParams({ goal: id })}
          onNewGoal={() => router.push('/goal/new')}
          onOpenHistory={() => undefined}
          onShare={() => undefined}
        />
      </Screen>
    );
  }
  if (state.error) return <ErrorScreen error={state.error} onRetry={state.refetch} />;
  if (state.loading || !detail || !today) return <LoadingScreen />;

  const goal = detail.id;
  const edit = () => router.push({ pathname: '/goal/edit', params: { goal } });
  return (
    <Screen>
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
      <OverLimitNotice plan={plan.data} />
      <GoalOverview
        goal={detail}
        today={today}
        activateGoal={mutations.activateGoal}
        markGoalAchieved={mutations.markGoalAchieved}
        onAchieved={state.refetch}
        onEdit={inlineEdit ? edit : undefined}
        onOpenMatrix={() => router.push({ pathname: '/matrix', params: { goal } })}
        onOpenArea={(position) =>
          router.push({ pathname: '/matrix/[position]', params: { position: String(position), goal } })
        }
      />
      <GoalsPanel
        goals={goals.data ?? []}
        currentId={goal}
        plan={plan.data}
        restoreGoal={mutations.restoreGoal}
        // setParams keeps this tab's stack; the other tabs follow their own ?goal= or the default pick.
        onOpenGoal={(id) => router.setParams({ goal: id })}
        onNewGoal={() => router.push('/goal/new')}
        onOpenHistory={() => router.push(insightsHref(goal))}
        onShare={() => router.push(shareHref(goal, 'progress'))}
      />
    </Screen>
  );
}
