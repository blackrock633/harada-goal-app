'use client';

import type { TodayDTO } from '@/application/dto';
import {
  addToTodayAction,
  checkRoutineAction,
  completeActionAction,
  removeFromTodayAction,
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

const focusMutations = {
  addToToday: addToTodayAction,
  removeFromToday: removeFromTodayAction,
};

export function TodayScreen({ data }: { data: TodayDTO }) {
  const { toast } = useToast();
  return (
    <TodayView
      data={data}
      mutations={mutations}
      focusMutations={focusMutations}
      onError={(message) => toast({ type: 'error', title: "Couldn't save", description: message })}
    />
  );
}
