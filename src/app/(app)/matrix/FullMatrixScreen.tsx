'use client';

import { useRouter } from 'next/navigation';
import type { GoalDetailDTO } from '@/application/dto';
import { addActionAction, updateActionAction } from '@/app/actions/matrix';
import { FullMatrix } from '@/ui/features/matrix';
import { guardMutations } from '@/ui/pending-writes';

const mutations = guardMutations({ addAction: addActionAction, updateAction: updateActionAction });

export function FullMatrixScreen({ goal, className }: { goal: GoalDetailDTO; className?: string }) {
  const router = useRouter();
  return (
    <FullMatrix
      goal={goal}
      className={className}
      mutations={mutations}
      onReloadLatest={() => router.refresh()}
    />
  );
}
