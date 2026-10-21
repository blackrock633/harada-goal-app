import { EmptyState, Screen } from '@/ui';

export default function TodayScreen() {
  return (
    <Screen>
      <EmptyState title="Nothing for today yet" message="Actions scheduled for today will appear here once your plan is set up." />
    </Screen>
  );
}
