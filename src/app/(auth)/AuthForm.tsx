'use client';

import * as React from 'react';
import Link from 'next/link';
import type { AuthFormState } from '@/app/actions/auth';
import { Button, Field, Input } from '@/ui/primitives';
import { routes } from '@/ui/routes';

type Mode = 'signin' | 'signup';

export function AuthForm({
  mode,
  action,
}: {
  mode: Mode;
  action: (prev: AuthFormState, form: FormData) => Promise<AuthFormState>;
}) {
  const [state, formAction, pending] = React.useActionState(action, {});
  const [timeZone, setTimeZone] = React.useState('UTC');
  React.useEffect(() => {
    // The user's own zone decides what "today" means (DECISIONS D-010).
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }, []);
  const err = (k: string) => state.fieldErrors?.[k]?.[0];
  const signup = mode === 'signup';

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && (
        <p role="alert" className="rounded-[var(--radius-sm)] border border-danger px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="rounded-[var(--radius-sm)] border border-rule px-3 py-2 text-sm text-ink">
          {state.notice}
        </p>
      )}
      {signup && (
        <Field label="Your name" error={err('displayName')}>
          <Input name="displayName" autoComplete="name" required defaultValue={state.values?.displayName} />
        </Field>
      )}
      <Field label="Email" error={err('email')}>
        <Input name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.values?.email} />
      </Field>
      <Field label="Password" error={err('password')} hint={signup ? 'At least 8 characters.' : undefined}>
        <Input
          name="password"
          type="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          required
          minLength={signup ? 8 : undefined}
        />
      </Field>
      {signup && <input type="hidden" name="timeZone" value={timeZone} />}
      <Button type="submit" loading={pending} className="w-full">
        {signup ? 'Create account' : 'Sign in'}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        {signup ? 'Already have an account? ' : 'New here? '}
        <Link
          href={signup ? routes.signIn : routes.signUp}
          className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-2"
        >
          {signup ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </form>
  );
}
