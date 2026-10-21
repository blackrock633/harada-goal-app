import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { errorMessage } from '@/data/errors';
import { QueryError } from '@/data/reads';
import { ErrorState, Screen } from '@/ui';

/** The slice of a TanStack query result the route screens look at. */
export interface QueryLike {
  isPending: boolean;
  isError: boolean;
  isRefetching: boolean;
  error: unknown;
  data: unknown;
  refetch: () => Promise<unknown>;
}

export interface Combined {
  /** True until every query has its first data (a disabled dependent query counts as pending). */
  loading: boolean;
  /** The first failure of a query that has no data to show. */
  error: QueryError | Error | null;
  refreshing: boolean;
  /** Refetch what failed, or everything when nothing failed (pull-to-refresh). */
  refetch: () => void;
}

/** Combine dependent queries (profile -> goals -> detail) into one screen state. */
export function combine(...queries: QueryLike[]): Combined {
  const failed = queries.filter((q) => q.isError && q.data === undefined);
  const first = failed[0];
  return {
    loading: !first && queries.some((q) => q.isPending),
    error: first ? ((first.error as Error | null) ?? new Error('failed')) : null,
    refreshing: queries.some((q) => q.isRefetching),
    refetch: () => {
      for (const q of failed.length > 0 ? failed : queries) void q.refetch();
    },
  };
}

export function messageFor(error: unknown): string {
  return error instanceof QueryError
    ? errorMessage(error.appError)
    : errorMessage({ code: 'UNAVAILABLE', message: '' });
}

export function LoadingScreen({ label = 'Loading' }: { label?: string }) {
  return (
    <Screen>
      <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ paddingVertical: 48, alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    </Screen>
  );
}

export function ErrorScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Screen>
      <ErrorState message={messageFor(error)} onRetry={onRetry} />
    </Screen>
  );
}

/** Loading / error states for a combined query; renders `children` once data is ready. */
export function Gate({ state, children }: { state: Combined; children: ReactNode }) {
  if (state.error) return <ErrorScreen error={state.error} onRetry={state.refetch} />;
  if (state.loading) return <LoadingScreen />;
  return <>{children}</>;
}
