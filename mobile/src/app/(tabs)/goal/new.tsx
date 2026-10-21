import { router } from 'expo-router';

import { useMutations, useReadContext } from '@/data/hooks';
import { GoalOnboarding } from '@/features/goal';
import { RefreshScreen } from '@/screens/RefreshScreen';
import { TEMPLATE_SUMMARIES } from '@/screens/templates';

export default function NewGoalScreen() {
  const mutations = useMutations();
  const ctx = useReadContext();
  return (
    <RefreshScreen>
      <GoalOnboarding
        mutations={mutations}
        templates={TEMPLATE_SUMMARIES}
        onUseTemplate={mutations.createGoalFromTemplate}
        today={ctx?.today}
        onOpenMatrix={(goal) => router.replace({ pathname: '/matrix', params: { goal } })}
        onGoToToday={() => router.replace('/today')}
      />
    </RefreshScreen>
  );
}
