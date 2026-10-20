import type { Metadata } from 'next';
import { requireCtx } from '@/app/lib/session';
import { resolveFocusedGoal } from '@/app/lib/focus';
import { Screen, ScreenHeader } from '@/ui/layout';
import { routes } from '@/ui/routes';
import { EditGoalScreen } from './EditGoalScreen';

export const metadata: Metadata = { title: 'Edit goal' };

export default async function EditGoalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCtx();
  const { goal } = await resolveFocusedGoal(ctx, (await searchParams).goal);
  return (
    <Screen width="reading">
      <ScreenHeader title="Edit goal" back={{ href: routes.goal(goal.id), label: 'My Goal' }} />
      <EditGoalScreen goal={goal} today={ctx.today} />
    </Screen>
  );
}
