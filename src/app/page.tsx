import { redirect } from 'next/navigation';
import * as q from '@/application/queries';
import { getDeps } from '@/infrastructure/container';
import { getCtx } from '@/app/lib/session';
import { routes } from '@/ui/routes';

export const dynamic = 'force-dynamic';

/** Entry: established users land on Today; new users are guided into goal creation. */
export default async function Home() {
  const ctx = await getCtx();
  if (!ctx) redirect(routes.signIn);
  const today = await q.getToday(await getDeps(), ctx);
  redirect(today.ok && !today.data.hasAnyGoals ? routes.goalNew : routes.today);
}
