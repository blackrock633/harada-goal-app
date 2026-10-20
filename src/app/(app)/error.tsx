'use client';

import { ErrorState } from '@/ui/primitives';
import { Screen } from '@/ui/layout';

/** Route-level failure (a query failed or the server was unreachable). Nothing the user typed is lost here: mutations report their own errors in place. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Screen width="reading">
      <ErrorState
        title="This page couldn't load"
        description="We couldn't reach the server or load your plan. Your saved data is safe. Check your connection and try again."
        onRetry={reset}
      />
    </Screen>
  );
}
