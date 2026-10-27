'use server';

import { redirect } from 'next/navigation';
import * as uc from '@/application/use-cases';
import { referralFrom, safeNextPath } from '@/application/web-public';
import { getDeps } from '@/infrastructure/container';
import { errorMessage } from '@/ui/errors';

export interface AuthFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Echoed back so a failed submit keeps what the user typed (never the password). */
  values?: { email?: string; displayName?: string };
  notice?: string;
}

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');
/** Where to go after signing in/up: a validated same-origin relative path from the form, else `fallback`. */
const nextFrom = (form: FormData, fallback: string) => safeNextPath(str(form.get('next'))) ?? fallback;

export async function signInAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = str(form.get('email'));
  let result;
  try {
    result = await uc.signIn(await getDeps(), { email, password: str(form.get('password')) });
  } catch {
    return { error: errorMessage({ code: 'UNAVAILABLE', message: '' }), values: { email } };
  }
  if (!result.ok) {
    return { error: errorMessage(result.error), fieldErrors: result.error.fieldErrors, values: { email } };
  }
  redirect(nextFrom(form, '/'));
}

export async function signUpAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = str(form.get('email'));
  const displayName = str(form.get('displayName'));
  const timeZone = str(form.get('timeZone')) || 'UTC';
  // Only a well-formed code is passed on; the database trigger decides whether it attributes a referral.
  const referralCode = referralFrom(str(form.get('ref')));
  let result;
  try {
    result = await uc.signUp(await getDeps(), {
      email,
      displayName,
      timeZone,
      password: str(form.get('password')),
      ...(referralCode ? { referralCode } : {}),
    });
  } catch {
    return { error: errorMessage({ code: 'UNAVAILABLE', message: '' }), values: { email, displayName } };
  }
  if (!result.ok) {
    return {
      error: errorMessage(result.error),
      fieldErrors: result.error.fieldErrors,
      values: { email, displayName },
    };
  }
  if (result.data.needsEmailConfirmation) {
    return { notice: 'Check your email to confirm your account, then sign in.', values: { email } };
  }
  redirect(nextFrom(form, '/goal/new'));
}

export async function signOutAction(): Promise<void> {
  try {
    await uc.signOut(await getDeps());
  } finally {
    redirect('/signin');
  }
}
