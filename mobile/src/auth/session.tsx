import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { getSupabase, SESSION_STORAGE_KEY, SupabaseNotConfiguredError } from '@/data/supabase';

import { installFlags } from './install-flags';
import { secureSessionStorage } from './secure-session-storage';

const INSTALL_FLAG = 'harada.installed';

interface KeyValue {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/**
 * NAT-03(b): iOS keeps keychain items after an app is deleted, so a reinstall would silently
 * restore the previous user's session. The app sandbox (where expo-sqlite's kv-store lives) IS
 * wiped on uninstall, so a missing install flag means "fresh install": drop any keychain session.
 */
export async function clearSessionIfFreshInstall(
  flags: KeyValue = installFlags,
  removeSession: () => Promise<void> = () => secureSessionStorage.removeItem(SESSION_STORAGE_KEY),
): Promise<boolean> {
  if ((await flags.getItem(INSTALL_FLAG)) !== null) return false;
  await removeSession();
  await flags.setItem(INSTALL_FLAG, '1');
  return true;
}

export type SessionState =
  | { status: 'loading' }
  | { status: 'misconfigured' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; session: Session };

const SessionContext = createContext<SessionState>({ status: 'loading' });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        await clearSessionIfFreshInstall();
        const supabase = getSupabase();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setState(data.session ? { status: 'signedIn', session: data.session } : { status: 'signedOut' });
        const sub = supabase.auth.onAuthStateChange((_event, session) => {
          setState(session ? { status: 'signedIn', session } : { status: 'signedOut' });
        });
        unsubscribe = () => sub.data.subscription.unsubscribe();
      } catch (e) {
        if (!cancelled) setState(e instanceof SupabaseNotConfiguredError ? { status: 'misconfigured' } : { status: 'signedOut' });
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
