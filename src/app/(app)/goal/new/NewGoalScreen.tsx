'use client';

import type { TemplateSummaryDTO } from '@/application/dto';
import { createGoalAction, createGoalFromTemplateAction, updateGoalAction } from '@/app/actions/goals';
import { GoalOnboarding } from '@/ui/features/goal';
import { guardMutations, trackWrite } from '@/ui/pending-writes';

const mutations = guardMutations({ createGoal: createGoalAction, updateGoal: updateGoalAction });
const useTemplate = (templateId: string, clientId: string) =>
  trackWrite(createGoalFromTemplateAction(templateId, clientId));

export function NewGoalScreen({ templates, today }: { templates: TemplateSummaryDTO[]; today: string }) {
  return <GoalOnboarding today={today} templates={templates} mutations={mutations} onUseTemplate={useTemplate} />;
}
