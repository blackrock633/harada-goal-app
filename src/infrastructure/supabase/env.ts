/**
 * Supabase environment lookup. Pure (no node-only imports) so middleware (edge runtime) can use it.
 * Keys are never logged or included in error messages.
 */
export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

/** Returns null when not configured (callers decide whether that is fatal). */
export function readSupabasePublicEnv(env: NodeJS.ProcessEnv = process.env): SupabasePublicEnv | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  // Supabase renamed the anon key to "publishable key"; accept either.
  const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function requireSupabasePublicEnv(env: NodeJS.ProcessEnv = process.env): SupabasePublicEnv {
  const v = readSupabasePublicEnv(env);
  if (!v) {
    throw new Error(
      'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).',
    );
  }
  return v;
}

/** Server-only. Bypasses RLS: use solely for admin operations such as deleting a user. */
export function requireServiceRoleKey(env: NodeJS.ProcessEnv = process.env): string {
  if (typeof window !== 'undefined') throw new Error('The service role key must never be used in a browser');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return key;
}
