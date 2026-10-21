/** useQuery wrappers over reads.ts. Errors are QueryError (see reads.ts); `error.appError` is the AppError. */
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { localDateInZone } from '@shared/domain/dates';

import { keys } from './query-client';
import { asQueryError, focusedGoal, loadGoalDetail, loadGoals, loadProfile, loadReview, loadToday, type ReadContext } from './reads';
import { createMutations } from './rpc';
import { getSupabase } from './supabase';

const guarded = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    throw asQueryError(e);
  }
};

export function useProfile() {
  return useQuery({ queryKey: keys.profile, queryFn: () => guarded(() => loadProfile(getSupabase())), staleTime: 5 * 60_000 });
}

/** Date + zone for date-dependent queries; recomputed on render, so a new day gets new query keys. */
export function useReadContext(): ReadContext | undefined {
  const { data } = useProfile();
  return data ? { today: localDateInZone(new Date(), data.timeZone), timeZone: data.timeZone } : undefined;
}

export function useToday() {
  const ctx = useReadContext();
  return useQuery({
    queryKey: keys.today(ctx?.today ?? ''),
    queryFn: () => guarded(() => loadToday(getSupabase(), ctx!)),
    enabled: !!ctx,
  });
}

export function useGoals() {
  const ctx = useReadContext();
  return useQuery({
    queryKey: [...keys.goals, ctx?.today ?? ''],
    queryFn: () => guarded(() => loadGoals(getSupabase(), ctx!)),
    enabled: !!ctx,
  });
}

/** The summary of the goal a goal-scoped screen should show (see focusedGoal). */
export function useFocusedGoal(requestedId?: string | null) {
  const q = useGoals();
  return { ...q, data: q.data ? focusedGoal(q.data, requestedId) : undefined };
}

export function useGoalDetail(goalId: string | undefined) {
  const ctx = useReadContext();
  return useQuery({
    queryKey: [...keys.goalDetail(goalId ?? ''), ctx?.today ?? ''],
    queryFn: () => guarded(() => loadGoalDetail(getSupabase(), goalId!, ctx!)),
    enabled: !!ctx && !!goalId,
  });
}

export function useReview(goalId: string | undefined) {
  const ctx = useReadContext();
  return useQuery({
    queryKey: [...keys.review(goalId ?? ''), ctx?.today ?? ''],
    queryFn: () => guarded(() => loadReview(getSupabase(), goalId!, ctx!)),
    enabled: !!ctx && !!goalId,
  });
}

/** Today's local date for mutations: the profile (cached) time zone, evaluated at call time. */
export function todayFromProfile(supabase: SupabaseClient, queryClient: QueryClient) {
  return async () => {
    const profile = await queryClient.fetchQuery({
      queryKey: keys.profile,
      queryFn: () => loadProfile(supabase),
      staleTime: 5 * 60_000,
    });
    return localDateInZone(new Date(), profile.timeZone);
  };
}

/** All mutations (rpc.ts) bound to the app's Supabase client and QueryClient. */
export function useMutations() {
  const queryClient = useQueryClient();
  return useMemo(() => {
    const supabase = getSupabase();
    return createMutations({ supabase, queryClient, today: todayFromProfile(supabase, queryClient) });
  }, [queryClient]);
}
