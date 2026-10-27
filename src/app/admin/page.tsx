import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchAdminMetrics, isAdmin } from '@/infrastructure/supabase/public-data';
import { userSupabase } from '@/infrastructure/supabase/server';
import { AdminMetricsView } from '@/ui/features/admin/AdminMetricsView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

/**
 * Operator metrics. Access is decided only by the database, with the caller's own session: am_i_admin() must be
 * true and admin_metrics() must succeed (it raises HG403 for anyone else). Everyone else, signed in or not,
 * gets the generic 404, so the page's existence isn't revealed. No role flag ever reaches the browser.
 */
export default async function AdminPage() {
  const client = await userSupabase().catch(() => null);
  if (!(await isAdmin(client))) notFound();
  const metrics = await fetchAdminMetrics(client);
  if (!metrics) notFound();
  return <AdminMetricsView metrics={metrics} />;
}
