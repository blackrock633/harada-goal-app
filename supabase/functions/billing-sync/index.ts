import { admin, config, checkoutDeps } from '../_shared/billing-deps.ts';
import { reconcileUser } from '../_shared/reconcile-deps.ts';
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  };
  if (origin && config.allowedOrigins?.includes(origin))
    Object.assign(headers, {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST',
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
      vary: 'Origin',
    });
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS')
    return new Response(null, {
      status: headers['access-control-allow-origin'] ? 204 : 403,
      headers,
    });
  if (req.method !== 'POST') return reply(405, { ok: false });
  try {
    const token = /^Bearer (\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
    const user = token ? await checkoutDeps.getUser(token) : null;
    if (!user)
      return reply(401, {
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'Please sign in' },
      });
    const { data: allowed, error } = await admin.rpc('billing_claim_sync', { p_user: user.id });
    if (error) throw error;
    if (allowed) await reconcileUser(user.id);
    return reply(200, { ok: true, data: { synchronized: !!allowed } });
  } catch {
    console.error(JSON.stringify({ component: 'billing-sync', code: 'sync_failed' }));
    return reply(503, {
      ok: false,
      error: {
        code: 'UNAVAILABLE',
        message: 'Verification is delayed. Check your plan again shortly.',
      },
    });
  }
});
