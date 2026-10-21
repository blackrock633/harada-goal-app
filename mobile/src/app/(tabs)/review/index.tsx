import { EmptyState, Screen } from '@/ui';

export default function ReviewScreen() {
  return (
    <Screen>
      <EmptyState title="Nothing to review yet" message="Reflections and plan changes will appear here as you work on your goal." />
    </Screen>
  );
}
