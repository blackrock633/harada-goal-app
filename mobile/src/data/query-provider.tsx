import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';

import { useSession } from '@/auth/session';

import { queryClient, subscribeFocusToAppState } from './query-client';

/**
 * Provides the shared QueryClient. Must sit inside SessionProvider.
 *
 * Query keys are not user-scoped, so the cache is the cross-account boundary: it is cleared when
 * the user signs out AND whenever the signed-in user changes (e.g. another account's session
 * replaces this one without an explicit sign-out). The check runs during render, before children
 * render, so no frame can show the previous account's goals.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const owner = session.status === 'signedIn' ? (session.session?.user?.id ?? 'unknown') : null;
  const lastOwner = useRef<string | null | undefined>(undefined);

  if (session.status !== 'loading' && lastOwner.current !== owner) {
    // First settled render keeps the (empty) cache; any later change of owner clears it.
    if (lastOwner.current !== undefined) queryClient.clear();
    lastOwner.current = owner;
  }

  useEffect(() => subscribeFocusToAppState(), []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
