import type { Metadata } from 'next';
import * as q from '@/application/queries';
import { getDeps } from '@/infrastructure/container';
import { requireCtx } from '@/app/lib/session';
import { unwrap } from '@/app/lib/focus';
import { createGoalAction, createGoalFromTemplateAction, updateGoalAction } from '@/app/actions/goals';
import { Screen } from '@/ui/layout';
import { GoalOnboarding } from '@/ui/features/goal';

export const metadata: Metadata = { title: 'New goal' };

export default async function NewGoalPage() {
  const ctx = await requireCtx();
  const templates = unwrap(await q.listTemplates(await getDeps(), ctx));
  return (
    <Screen width="reading">
      <GoalOnboarding
        today={ctx.today}
        templates={templates}
        mutations={{ createGoal: createGoalAction, updateGoal: updateGoalAction }}
        onUseTemplate={createGoalFromTemplateAction}
      />
    </Screen>
  );
}
