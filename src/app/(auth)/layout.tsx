import { redirect } from 'next/navigation';
import { getCtx } from '@/app/lib/session';

export const dynamic = 'force-dynamic';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCtx()) redirect('/');
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10 pt-[calc(2.5rem+env(safe-area-inset-top))]"
    >
      <p className="font-serif text-2xl font-semibold tracking-tight text-ink">Harada</p>
      <p className="mt-1 text-ink-muted">Turn a meaningful goal into daily action.</p>
      <div className="mt-8">{children}</div>
    </main>
  );
}
