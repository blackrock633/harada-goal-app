/**
 * delete-account: the one write that cannot be an RPC (D-017), because deleting an auth user needs the
 * service-role key, which must never reach a device.
 *
 * POST with the caller's `Authorization: Bearer <access token>` and body
 * `{ password, confirmation: 'DELETE' }` (deleteAccountSchema). The caller must re-enter their password.
 * Deleting the auth user cascades through profiles to all of their data.
 *
 * Pure and dependency-injected (standard Request/Response only), so it runs under Deno (index.ts) and is
 * unit-tested under Node. Responses use the app's Result shape: `{ ok: true, data: null }` or
 * `{ ok: false, error: { code, message, fieldErrors? } }`.
 */
export interface DeleteAccountDeps {
  /** Verifies the access token with Supabase Auth; null when invalid or expired. */
  getUser(accessToken: string): Promise<{ id: string; email: string } | null>;
  /** True when the password is correct for this email. */
  verifyPassword(email: string, password: string): Promise<boolean>;
  /** Deletes the auth user (service role). */
  deleteUser(userId: string): Promise<void>;
  logError?(message: string, detail: unknown): void;
}

type ErrorCode = 'VALIDATION' | 'UNAUTHENTICATED' | 'INTERNAL';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fail(status: number, code: ErrorCode, message: string, fieldErrors?: Record<string, string[]>): Response {
  return json(status, { ok: false, error: fieldErrors ? { code, message, fieldErrors } : { code, message } });
}

export async function handleDeleteAccount(req: Request, deps: DeleteAccountDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { ok: false, error: { code: 'VALIDATION', message: 'Use POST' } });

  const auth = req.headers.get('authorization') ?? '';
  const token = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
  if (!token) return fail(401, 'UNAUTHENTICATED', 'Please sign in');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'VALIDATION', 'Invalid request body');
  }
  const { password, confirmation } = (body ?? {}) as { password?: unknown; confirmation?: unknown };
  const fieldErrors: Record<string, string[]> = {};
  if (typeof password !== 'string' || password.length < 1 || password.length > 128) fieldErrors.password = ['Required'];
  if (confirmation !== 'DELETE') fieldErrors.confirmation = ['Type DELETE to confirm'];
  if (Object.keys(fieldErrors).length > 0) return fail(400, 'VALIDATION', 'Please check the highlighted fields', fieldErrors);

  try {
    const user = await deps.getUser(token);
    if (!user) return fail(401, 'UNAUTHENTICATED', 'Please sign in');
    if (!(await deps.verifyPassword(user.email, password as string))) {
      return fail(400, 'VALIDATION', 'Password is incorrect', { password: ['Password is incorrect'] });
    }
    await deps.deleteUser(user.id);
    return json(200, { ok: true, data: null });
  } catch (e) {
    deps.logError?.('delete-account failed', e instanceof Error ? e.message : 'unknown');
    return fail(500, 'INTERNAL', 'Something went wrong. Your account was not deleted — please try again.');
  }
}
