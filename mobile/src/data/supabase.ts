import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { secureSessionStorage } from '@/auth/secure-session-storage';

/**
 * The one Supabase client for the app. Only the PUBLIC project URL and anon/publishable key ship
 * in the app (EXPO_PUBLIC_*); row-level security and the RPCs enforce access. The service-role
 * key must never be configured here.
 *
 * The session lives only in the platform keychain (secureSessionStorage). Fail closed: without
 * configuration the app shows a configuration error instead of silently running without auth.
 */
export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('Supabase is not configured: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }
}

export function readSupabaseEnv(env: Record<string, string | undefined> = process.env) {
  const url = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = (env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  return url && anonKey ? { url, anonKey } : null;
}

/** Fixed so sign-out can always wipe the stored session itself (see auth.ts). */
export const SESSION_STORAGE_KEY = 'harada-auth-session';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const env = readSupabaseEnv({
    // Expo inlines EXPO_PUBLIC_* only for direct `process.env.NAME` references.
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!env) throw new SupabaseNotConfiguredError();
  client = createClient(env.url, env.anonKey, {
    auth: {
      storage: secureSessionStorage,
      storageKey: SESSION_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      // Native apps have no URL to read a session from.
      detectSessionInUrl: false,
    },
  });
  // Per Expo's Supabase guide: run the token refresh loop only while the app is in the foreground.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') client?.auth.startAutoRefresh();
    else client?.auth.stopAutoRefresh();
  });
  return client;
}
