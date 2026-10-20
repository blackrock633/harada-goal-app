'use client';

import type { TodayDTO } from '@/application/dto';
import {
  checkRoutineAction,
  completeActionAction,
  reopenActionAction,
  uncheckRoutineAction,
} from '@/app/actions/execution';
import { useToast } from '@/ui/primitives';
import { TodayView } from '@/ui/features/today';

const mutations = {
  completeAction: completeActionAction,
  reopenAction: reopenActionAction,
  checkRoutine: checkRoutineAction,
  uncheckRoutine: uncheckRoutineAction,
};

export function TodayScreen({ data }: { data: TodayDTO }) {
  const { toast } = useToast();
  return (
    <TodayView
      data={data}
      mutations={mutations}
      onError={(message) => toast({ type: 'error', title: "Couldn't save", description: message })}
    />
  );
}
