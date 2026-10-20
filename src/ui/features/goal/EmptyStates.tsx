import { routes } from '@/ui/routes';
import { ButtonLink, EmptyState } from '@/ui/primitives';

export function NoGoalsEmptyState() {
  return (
    <EmptyState
      title="Set your first goal"
      description="Start with one sentence. You can add reasons and key areas whenever you like."
      action={<ButtonLink href={routes.goalNew}>Create a goal</ButtonLink>}
    />
  );
}

export function NoKeyAreasEmptyState({ goalId }: { goalId: string }) {
  return (
    <EmptyState
      title="No key areas yet"
      description="Key areas break your goal into up to eight parts. Add the first one in your matrix."
      action={<ButtonLink href={routes.matrix(goalId)}>Open matrix</ButtonLink>}
    />
  );
}
