import type { Metadata } from 'next';
import { requireCtx } from '@/app/lib/session';
import { resolveFocusedGoal } from '@/app/lib/focus';
import { Screen, ScreenHeader } from '@/ui/layout';
import { MatrixOverview } from '@/ui/features/matrix';
import { routes } from '@/ui/routes';
import { FullMatrixScreen } from './FullMatrixScreen';

export const metadata: Metadata = { title: 'Matrix' };

export default async function MatrixPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCtx();
  const { goal } = await resolveFocusedGoal(ctx, (await searchParams).goal);
  return (
    <Screen>
      <ScreenHeader
        eyebrow="Harada matrix"
        title={goal.title}
        back={{ href: routes.goal(goal.id), label: 'My Goal' }}
      />
      {/* Phones and tablets: a readable key-area map; each tile opens that key area. */}
      <MatrixOverview goal={goal} className="mt-6 lg:hidden" />
      {/* Large screens: the full 9×9 planning surface. */}
      <FullMatrixScreen goal={goal} className="mt-8 hidden lg:block" />
    </Screen>
  );
}
