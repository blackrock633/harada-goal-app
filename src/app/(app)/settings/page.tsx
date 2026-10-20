import type { Metadata } from 'next';
import * as uc from '@/application/use-cases';
import { getDeps } from '@/infrastructure/container';
import { requireCtx } from '@/app/lib/session';
import { signOutAction } from '@/app/actions/auth';
import { Button } from '@/ui/primitives';
import { Screen, ScreenHeader, Section } from '@/ui/layout';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  await requireCtx();
  const me = await uc.getCurrentUser(await getDeps());
  const user = me.ok ? me.data : null;
  return (
    <Screen width="reading">
      <ScreenHeader title="Settings" />
      <Section title="Account">
        <dl className="divide-y divide-rule">
          <div className="py-3">
            <dt className="text-sm text-ink-muted">Name</dt>
            <dd className="break-words text-ink">{user?.displayName ?? '—'}</dd>
          </div>
          <div className="py-3">
            <dt className="text-sm text-ink-muted">Email</dt>
            <dd className="break-words text-ink">{user?.email ?? '—'}</dd>
          </div>
          <div className="py-3">
            <dt className="text-sm text-ink-muted">Time zone</dt>
            <dd className="text-ink">{user?.timeZone ?? '—'}</dd>
            <dd className="mt-1 text-sm text-ink-muted">Decides when your day starts and what counts as “today”.</dd>
          </div>
        </dl>
        <form action={signOutAction} className="mt-6">
          <Button type="submit" variant="secondary">Sign out</Button>
        </form>
      </Section>
    </Screen>
  );
}
