import { admin } from '../_shared/billing-deps.ts';
import { reconcileUser } from '../_shared/reconcile-deps.ts';
import { sameSecret } from '../_shared/native-billing.ts';
// Called by a scheduled job, never by the app. Configure the secret in Vault, not in SQL source.
Deno.serve(async (req: Request) => {
  const key = Deno.env.get('BILLING_RECONCILE_AUTHORIZATION');
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  if (!key || key.length < 32) return new Response(null, { status: 503 });
  if (!(await sameSecret(req.headers.get('authorization') ?? '', key)))
    return new Response(null, { status: 401 });
  const { data, error } = await admin.rpc('billing_reconcile_users');
  if (error) return new Response(null, { status: 503 });
  let failed = 0;
  for (const user of data as string[]) {
    try {
      await reconcileUser(user);
      await admin.rpc('billing_mark_reconciled', { p_user: user });
    } catch {
      failed++;
      console.error(JSON.stringify({ component: 'billing-reconcile', code: 'sync_failed' }));
    }
  }
  return Response.json({ processed: data.length, failed }, { status: failed ? 503 : 200 });
});
