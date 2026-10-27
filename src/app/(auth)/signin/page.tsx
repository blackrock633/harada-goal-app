import type { Metadata } from 'next';
import { signInAction } from '@/app/actions/auth';
import { safeNextPath } from '@/application/web-public';
import { AuthForm } from '../AuthForm';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <>
      <h1 className="mb-6 font-serif text-xl text-ink">Sign in</h1>
      <AuthForm mode="signin" action={signInAction} next={safeNextPath(params.next)} />
    </>
  );
}
