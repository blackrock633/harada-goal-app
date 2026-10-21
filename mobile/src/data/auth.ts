import type { z } from 'zod';

import { secureSessionStorage } from '@/auth/secure-session-storage';
import { fail, ok, type Result } from '@shared/application/result';
import { signInSchema, signUpSchema } from '@shared/application/schemas';

import { authErrorToAppError } from './auth-errors';
import { getSupabase, SESSION_STORAGE_KEY } from './supabase';

/** Zod issues → Result fieldErrors (first message per field), same shape the web forms use. */
function validationFailure(error: z.ZodError) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !fieldErrors[key]) fieldErrors[key] = [issue.message];
  }
  return fail('VALIDATION', 'Check the highlighted fields.', fieldErrors);
}

const unavailable = () =>
  fail('UNAVAILABLE', 'The service is temporarily unavailable. Please try again.');

export async function signIn(input: z.input<typeof signInSchema>): Promise<Result<{ userId: string }>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const { data, error } = await getSupabase().auth.signInWithPassword(parsed.data);
    if (error || !data.user) return { ok: false, error: authErrorToAppError(error) };
    return ok({ userId: data.user.id });
  } catch {
    return unavailable();
  }
}

export async function signUp(
  input: z.input<typeof signUpSchema>,
): Promise<Result<{ userId: string; needsEmailConfirmation: boolean }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { email, password, displayName, timeZone } = parsed.data;
  try {
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
      // The on_auth_user_created trigger creates the profile from these keys.
      options: { data: { display_name: displayName, time_zone: timeZone } },
    });
    if (error || !data.user) return { ok: false, error: authErrorToAppError(error) };
    return ok({ userId: data.user.id, needsEmailConfirmation: !data.session });
  } catch {
    return unavailable();
  }
}

/**
 * Sign out of this device. The keychain session is ALWAYS removed — even if the server call fails
 * (offline) — because supabase-js keeps the local session when its logout request errors.
 */
export async function signOut(): Promise<Result<null>> {
  try {
    await getSupabase().auth.signOut({ scope: 'local' });
  } catch {
    // fall through: local sign-out must still happen
  } finally {
    await secureSessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
  return ok(null);
}
