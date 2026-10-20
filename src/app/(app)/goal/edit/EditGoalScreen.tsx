'use client';

import { useRouter } from 'next/navigation';
import type { GoalFieldsDTO } from '@/application/dto';
import { createGoalAction, updateGoalAction } from '@/app/actions/goals';
import { useToast } from '@/ui/primitives';
import { GoalForm } from '@/ui/features/goal';
import { routes } from '@/ui/routes';

export function EditGoalScreen({ goal, today }: { goal: GoalFieldsDTO; today: string }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <GoalForm
      mode="edit"
      goal={goal}
      today={today}
      mutations={{ createGoal: createGoalAction, updateGoal: updateGoalAction }}
      cancelHref={routes.goal(goal.id)}
      onReloadLatest={() => router.refresh()}
      onSaved={(saved) => {
        toast({ type: 'success', title: 'Goal saved' });
        router.push(routes.goal(saved.id));
      }}
    />
  );
}
