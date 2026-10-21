import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';

import { useSession } from '@/auth/session';

import { queryClient, subscribeFocusToAppState } from './query-client';

/**
 * Provides the shared QueryClient. Must sit inside SessionProvider: when the user signs out the
 * cache is cleared, so the next account never sees the previous account's goals.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const session = useSession();

  useEffect(() => subscribeFocusToAppState(), []);

  useEffect(() => {
    if (session.status === 'signedOut') queryClient.clear();
  }, [session.status]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
