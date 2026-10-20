import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AuthGateway, AuthGatewayError, AuthUser } from '@/application/ports';
import type { Id } from '@/domain/types';
import { requireServiceRoleKey, requireSupabasePublicEnv } from '../supabase/env';
import { isNoSessionError, mapSupabaseAuthError } from './map-auth-error';

/**
 * Supabase Auth bound to the CURRENT request's cookies. A fresh cookie-bound client is built on every
 * call (never cached), so this object is safe to keep in a process-wide Deps singleton.
 * Server-only: uses next/headers and, for deleteUser, the service role key.
 */
export class SupabaseAuthGateway implements AuthGateway {
  private async client(): Promise<SupabaseClient> {
    if (typeof window !== 'undefined') throw new Error('SupabaseAuthGateway is server-only');
    const { url, anonKey } = requireSupabasePublicEnv();
    const store = await cookies();
    return createServerClient(url, anonKey, {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) store.set(name, value, options);
          } catch {
            // Called from a Server Component, where cookies are read-only. The middleware refreshes the
            // session, so ignoring this is the documented behaviour.
          }
        },
      },
    });
  }

  private fail(error: unknown): never {
    throw mapSupabaseAuthError(error) ?? error;
  }

  async signUp(input: { email: string; password: string; displayName: string; timeZone: string }) {
    const supabase = await this.client();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      // Read by the on_auth_user_created trigger (public.handle_new_user).
      options: { data: { display_name: input.displayName, time_zone: input.timeZone } },
    });
    if (error) this.fail(error);
    const user = data.user;
    if (!user) throw new Error('Supabase signUp returned no user');
    // With email confirmation on, signing up an already-registered address returns an obfuscated user
    // with no identities instead of an error.
    if (Array.isArray(user.identities) && user.identities.length === 0) throw new AuthGatewayError('EMAIL_TAKEN');
    return { user: { id: user.id, email: user.email ?? input.email }, confirmed: data.session !== null };
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const supabase = await this.client();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) this.fail(error);
    if (!data.user) throw new Error('Supabase signIn returned no user');
    return { id: data.user.id, email: data.user.email ?? email };
  }

  async signOut(): Promise<void> {
    const supabase = await this.client();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error && !isNoSessionError(error)) this.fail(error);
  }

  async getUser(): Promise<AuthUser | null> {
    const supabase = await this.client();
    // getUser() asks the Auth server to validate the JWT; getSession() would only decode the cookie.
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (isNoSessionError(error)) return null;
      this.fail(error);
    }
    return data.user ? { id: data.user.id, email: data.user.email ?? '' } : null;
  }

  async verifyPassword(email: string, password: string): Promise<boolean> {
    const { url, anonKey } = requireSupabasePublicEnv();
    // Separate non-persisting client so this check never replaces the caller's session cookies.
    const probe = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await probe.auth.signInWithPassword({ email, password });
    if (error) {
      const mapped = mapSupabaseAuthError(error);
      if (mapped?.reason === 'INVALID_CREDENTIALS') return false;
      this.fail(error);
    }
    await probe.auth.signOut({ scope: 'local' }).catch(() => undefined);
    return true;
  }

  async updatePassword(newPassword: string): Promise<void> {
    const supabase = await this.client();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) this.fail(error);
    const { error: outErr } = await supabase.auth.signOut({ scope: 'others' });
    if (outErr) this.fail(outErr);
  }

  async deleteUser(userId: Id): Promise<void> {
    const { url } = requireSupabasePublicEnv();
    const admin = createClient(url, requireServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && (error as { code?: string }).code !== 'user_not_found') this.fail(error);
    // Drop this device's now-dead session cookies.
    await this.signOut().catch(() => undefined);
  }
}
