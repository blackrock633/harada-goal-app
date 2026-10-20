'use client';

import { useRouter } from 'next/navigation';
import type { GoalDetailDTO } from '@/application/dto';
import { addActionAction, updateActionAction } from '@/app/actions/matrix';
import { FullMatrix } from '@/ui/features/matrix';

export function FullMatrixScreen({ goal, className }: { goal: GoalDetailDTO; className?: string }) {
  const router = useRouter();
  return (
    <FullMatrix
      goal={goal}
      className={className}
      mutations={{ addAction: addActionAction, updateAction: updateActionAction }}
      onReloadLatest={() => router.refresh()}
    />
  );
}
