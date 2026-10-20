'use client';

import { useRouter } from 'next/navigation';
import type { GoalDetailDTO } from '@/application/dto';
import {
  addActionAction,
  addOutcomeAction,
  updateActionAction,
  updateOutcomeAction,
} from '@/app/actions/matrix';
import {
  checkRoutineAction,
  completeActionAction,
  reopenActionAction,
  uncheckRoutineAction,
} from '@/app/actions/execution';
import { useToast } from '@/ui/primitives';
import { KeyAreaView } from '@/ui/features/matrix';

const matrix = {
  addOutcome: addOutcomeAction,
  updateOutcome: updateOutcomeAction,
  addAction: addActionAction,
  updateAction: updateActionAction,
};
const execution = {
  completeAction: completeActionAction,
  reopenAction: reopenActionAction,
  checkRoutine: checkRoutineAction,
  uncheckRoutine: uncheckRoutineAction,
};

export function KeyAreaScreen({ goal, position, today }: { goal: GoalDetailDTO; position: number; today: string }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <KeyAreaView
      goal={goal}
      position={position}
      today={today}
      matrix={matrix}
      execution={execution}
      onError={(message) => toast({ type: 'error', title: "Couldn't save", description: message })}
      onReloadLatest={() => router.refresh()}
    />
  );
}
