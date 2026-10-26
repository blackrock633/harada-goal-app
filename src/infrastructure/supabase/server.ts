import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSupabasePublicEnv, supabaseCookieOptions } from './env';

/**
 * Server-side Supabase clients for the public web surface and the billing/admin pages. Only the public URL and
 * anon key are used here; the service-role key never is. Every function returns null when Supabase is not
 * configured (e.g. local dev on PGlite), and callers render an honest "unavailable" state.
 */

/** A client with no session: runs as the `anon` role (public catalogue, shared cards, visitor analytics). */
export function anonSupabase(): SupabaseClient | null {
  const env = readSupabasePublicEnv();
  if (!env) return null;
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** A client bound to the current request's session cookies: runs as the signed-in user under RLS. */
export async function userSupabase(): Promise<SupabaseClient | null> {
  const env = readSupabasePublicEnv();
  if (!env) return null;
  const store = await cookies();
  return createServerClient(env.url, env.anonKey, {
    cookieOptions: supabaseCookieOptions(),
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Read-only in Server Components; the middleware refreshes the session.
        }
      },
    },
  });
}

/**
 * The signed-in user's access token, after the Auth server has verified the session (getUser), for calling
 * an Edge Function on the user's behalf. null when signed out or not configured.
 */
export async function verifiedAccessToken(client: SupabaseClient): Promise<string | null> {
  const { data: userData, error } = await client.auth.getUser();
  if (error || !userData.user) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

/** POSTs to a Supabase Edge Function as the user. Returns the HTTP status and parsed JSON body (or null). */
export async function callEdgeFunction(
  name: 'billing-checkout' | 'billing-portal',
  accessToken: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const env = readSupabasePublicEnv();
  if (!env) return { status: 503, body: { ok: false, error: { code: 'NOT_CONFIGURED' } } };
  const res = await fetch(`${env.url.replace(/\/+$/, '')}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      apikey: env.anonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}
