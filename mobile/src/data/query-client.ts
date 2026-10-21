/**
 * The one TanStack Query client for the app, plus every query key.
 *
 * Policy:
 *  - Reads retry twice with exponential backoff, but only for failures a retry can fix
 *    (UNAVAILABLE / INTERNAL / RATE_LIMITED or an unclassified throw). NOT_FOUND, UNAUTHENTICATED,
 *    VALIDATION etc. fail immediately so the screen can show ErrorState.
 *  - Mutations never auto-retry: the user retries, and create mutations reuse the same client id
 *    (errors.ts newClientId) so the retry is idempotent.
 *  - Data is fresh for 30s; the app foregrounding triggers a refetch of stale queries
 *    (focusManager + AppState, per https://tanstack.com/query/latest/docs/framework/react/react-native).
 */
import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { isRetryable } from './errors';
import { QueryError } from './reads';

export const STALE_TIME_MS = 30_000;
export const READ_RETRIES = 2;

/** Exponential backoff: 1s, 2s, ... capped at 8s. */
export const retryDelay = (attempt: number): number => Math.min(1000 * 2 ** attempt, 8000);

/** Retry a failed read only if it was transient and fewer than READ_RETRIES retries were made. */
export function shouldRetryRead(failureCount: number, error: unknown): boolean {
  if (failureCount >= READ_RETRIES) return false;
  if (error instanceof QueryError) return isRetryable(error.appError);
  return true;
}

/** All query keys. Prefix matching means `keys.goalRoot(id)` covers detail and review for a goal. */
export const keys = {
  profile: ['profile'] as const,
  /** Prefix of every today query (the key itself includes the local date so midnight rolls over). */
  todayRoot: ['today'] as const,
  today: (today: string) => ['today', today] as const,
  goals: ['goals'] as const,
  goalDetail: (goalId: string) => ['goal', goalId] as const,
  review: (goalId: string) => ['review', goalId] as const,
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: STALE_TIME_MS, retry: shouldRetryRead, retryDelay },
      mutations: { retry: 0 },
    },
  });
}

export const queryClient = createQueryClient();

/**
 * Tell TanStack when the app is in the foreground. Returns the unsubscribe. Web has its own
 * visibilitychange handling, so this only wires native platforms.
 */
export function subscribeFocusToAppState(
  addListener: (type: 'change', fn: (s: AppStateStatus) => void) => { remove(): void } = AppState.addEventListener.bind(AppState),
  platform: string = Platform.OS,
): () => void {
  if (platform === 'web') return () => {};
  const sub = addListener('change', (status) => focusManager.setFocused(status === 'active'));
  return () => sub.remove();
}
