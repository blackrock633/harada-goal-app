import { useFocusedGoal, useGoalDetail, useProfile, useReadContext } from '@/data/hooks';

import { combine, type QueryLike } from './queryState';
import { useGoalParam } from './useGoalParam';

/**
 * Everything a goal-scoped tab needs: the focused goal (?goal= else the default pick), its detail,
 * today's local date, and one combined loading/error state. `noGoals` is true once goals loaded
 * and the user has none to show.
 */
export function useGoalScreen<Q extends QueryLike = never>(useExtra?: (goalId: string | undefined) => Q) {
  const requested = useGoalParam();
  const profile = useProfile();
  const ctx = useReadContext();
  const goals = useFocusedGoal(requested);
  const summary = goals.data;
  const detail = useGoalDetail(summary?.id);
  const extra = useExtra?.(summary?.id);
  const noGoals = goals.isSuccess && !summary;
  // With no goal the detail query is disabled (pending forever); leave it out of the state then.
  const state = noGoals ? combine(profile, goals) : combine(profile, goals, detail, ...(extra ? [extra] : []));
  return {
    state, summary, detail: detail.data,
    extra, today: ctx?.today, noGoals, requested, refetchDetail: () => void detail.refetch() };
}
