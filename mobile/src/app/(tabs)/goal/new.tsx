import { router } from 'expo-router';

import { useMutations, useReadContext } from '@/data/hooks';
import { getTemplate, hasFeature, templatePayload, usePlan, useTemplates } from '@/data/premium';
import { GoalOnboarding, type OnboardingTemplate } from '@/features/goal';
import { UpgradePrompt } from '@/features/premium/UpgradePrompt';
import { TEMPLATE_SUMMARIES } from '@/screens/templates';

import { Screen } from '@/ui';

export default function NewGoalScreen() {
  const mutations = useMutations();
  const ctx = useReadContext();
  const plan = usePlan();
  // The server catalogue (free and premium, with locks). Until it loads, or if it can't (offline,
  // a server without the catalogue), the examples shipped with the app keep working.
  const catalogue = useTemplates();
  const fromServer = catalogue.isSuccess && Array.isArray(catalogue.data) && catalogue.data.length > 0;
  const templates: OnboardingTemplate[] = fromServer ? catalogue.data : TEMPLATE_SUMMARIES;
  const atActiveLimit =
    !!plan.data &&
    !hasFeature(plan.data, 'multiple_goals') &&
    plan.data.activeGoals >= (plan.data.maxActiveGoals ?? 1);

  async function startFromTemplate(templateId: string, clientId: string) {
    if (!fromServer) return mutations.createGoalFromTemplate(templateId, clientId);
    // get_template re-checks the plan (HG402 → UPGRADE_REQUIRED for a premium template on Free).
    const content = await getTemplate(templateId);
    if (!content.ok) return content;
    return mutations.createGoalFromContent(templatePayload(content.data, clientId));
  }

  return (
    <Screen>
      {atActiveLimit ? (
        <UpgradePrompt
          feature="multiple_goals"
          note="You already have an active goal. You can plan this goal as a draft now, or finish or archive your current active goal before activating this one."
        />
      ) : null}
      <GoalOnboarding
        mutations={mutations}
        templates={templates}
        onUseTemplate={startFromTemplate}
        today={ctx?.today}
        onOpenMatrix={(goal) => router.replace({ pathname: '/matrix', params: { goal } })}
        onGoToToday={() => router.replace('/today')}
      />
    </Screen>
  );
}
