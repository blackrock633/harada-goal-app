import type { Metadata } from 'next';
import { signUpAction } from '@/app/actions/auth';
import { AuthForm } from '../AuthForm';

export const metadata: Metadata = { title: 'Create account' };

export default function SignUpPage() {
  return (
    <>
      <h1 className="mb-6 font-serif text-xl text-ink">Create your account</h1>
      <AuthForm mode="signup" action={signUpAction} />
    </>
  );
}
