import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import * as uc from '@/application/use-cases';
import { getDeps } from '@/infrastructure/container';
import { requireCtx } from '@/app/lib/session';
import { signOutAction } from '@/app/actions/auth';
import { AppShell } from '@/ui/shell/AppShell';
import { routes } from '@/ui/routes';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireCtx();
  const me = await uc.getCurrentUser(await getDeps());
  if (!me.ok || !me.data) redirect(routes.signIn);

  return (
    // AppShell reads ?goal= with useSearchParams, which needs a Suspense boundary.
    <Suspense>
      <AppShell user={{ displayName: me.data.displayName }} signOutAction={signOutAction}>
        {children}
      </AppShell>
    </Suspense>
  );
}
