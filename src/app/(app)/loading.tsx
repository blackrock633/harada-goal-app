import { Skeleton } from '@/ui/primitives';
import { Screen } from '@/ui/layout';

export default function Loading() {
  return (
    <Screen aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-2/3 max-w-md" />
      <Skeleton className="mt-3 h-4 w-40" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </Screen>
  );
}
