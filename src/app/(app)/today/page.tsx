import type { Metadata } from 'next';
import * as q from '@/application/queries';
import { getDeps } from '@/infrastructure/container';
import { requireCtx } from '@/app/lib/session';
import { unwrap } from '@/app/lib/focus';
import { Screen } from '@/ui/layout';
import { TodayScreen } from './TodayScreen';

export const metadata: Metadata = { title: 'Today' };

export default async function TodayPage() {
  const ctx = await requireCtx();
  const data = unwrap(await q.getToday(await getDeps(), ctx));
  return (
    <Screen>
      <TodayScreen data={data} />
    </Screen>
  );
}
