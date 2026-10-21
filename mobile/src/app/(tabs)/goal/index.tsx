import { EmptyState, Screen } from '@/ui';

export default function GoalScreen() {
  return (
    <Screen>
      <EmptyState title="No goal yet" message="Your goal and its progress will appear here once you create one." />
    </Screen>
  );
}
