import type { Metadata } from 'next';
import { signUpAction } from '@/app/actions/auth';
import { referralFrom, safeNextPath } from '@/application/web-public';
import { AuthForm } from '../AuthForm';

export const metadata: Metadata = { title: 'Create account' };

/** ?ref=<10 hex> (from a shared progress card) and ?next=<relative path> are validated here and carried by the form. */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <>
      <h1 className="mb-6 font-serif text-xl text-ink">Create your account</h1>
      <AuthForm
        mode="signup"
        action={signUpAction}
        referralCode={referralFrom(params.ref)}
        next={safeNextPath(params.next)}
      />
    </>
  );
}
