import type { Metadata } from 'next';
import { signInAction } from '@/app/actions/auth';
import { AuthForm } from '../AuthForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <>
      <h1 className="mb-6 font-serif text-xl text-ink">Sign in</h1>
      <AuthForm mode="signin" action={signInAction} />
    </>
  );
}
