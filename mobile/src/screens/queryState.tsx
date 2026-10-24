import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage } from '@/data/errors';
import { QueryError } from '@/data/reads';
import { useTheme } from '@/theme';
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

/** A still, ruled outline of a screen (title + rows): the form before it is filled in. No shimmer. */
export function LoadingScreen({ label = 'Loading' }: { label?: string }) {
  const { colors, radius, space } = useTheme();
  const bar = (width: `${number}%`, height: number) => (
    <View style={{ width, height, borderRadius: radius.sm, backgroundColor: colors.surfaceSunken }} />
  );
  return (
    <Screen>
      <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ gap: space[6], paddingTop: space[2] }}>
        <View style={{ gap: space[3] }}>
          {bar('62%', 28)}
          {bar('40%', 14)}
        </View>
        <View>
          {[78, 64, 70, 52].map((w) => (
            <View
              key={w}
              style={{ paddingVertical: space[4], gap: space[2], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.rule }}
            >
              {bar(`${w}%`, 14)}
              {bar(`${w - 30}%`, 10)}
            </View>
          ))}
        </View>
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
