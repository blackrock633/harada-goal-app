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
  /**
   * Counts one password re-check for this user; false once the per-user limit is used up (5 per 15 minutes,
   * public.consume_password_attempt). Stops a stolen access token from brute-forcing the password here.
   */
  consumeAttempt(userId: string): Promise<boolean>;
  /** True when the password is correct for this email. Throws when Auth could not answer. */
  verifyPassword(email: string, password: string): Promise<boolean>;
  /** Deletes the auth user (service role). */
  deleteUser(userId: string): Promise<void>;
  logError?(message: string, detail: unknown): void;
  /** Browser origins allowed to call this (the Expo web build). Native apps send no Origin and need no CORS. */
  allowedOrigins?: readonly string[];
}

/** The body is two short strings; anything bigger is refused before it is read in full. */
const MAX_BODY_BYTES = 4096;

type ErrorCode = 'VALIDATION' | 'UNAUTHENTICATED' | 'RATE_LIMITED' | 'INTERNAL';

function corsHeaders(req: Request, allowed: readonly string[] = []): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    vary: 'Origin',
  };
}

export async function handleDeleteAccount(req: Request, deps: DeleteAccountDeps): Promise<Response> {
  const cors = corsHeaders(req, deps.allowedOrigins);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });
  const fail = (status: number, code: ErrorCode, message: string, fieldErrors?: Record<string, string[]>) =>
    json(status, { ok: false, error: fieldErrors ? { code, message, fieldErrors } : { code, message } });

  if (req.method === 'OPTIONS') return new Response(null, { status: cors['access-control-allow-origin'] ? 204 : 403, headers: cors });
  if (req.method !== 'POST') return json(405, { ok: false, error: { code: 'VALIDATION', message: 'Use POST' } });

  const auth = req.headers.get('authorization') ?? '';
  const token = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
  if (!token) return fail(401, 'UNAUTHENTICATED', 'Please sign in');

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return fail(413, 'VALIDATION', 'Request too large');
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return fail(413, 'VALIDATION', 'Request too large');
    body = JSON.parse(text);
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
    if (!(await deps.consumeAttempt(user.id))) {
      return fail(429, 'RATE_LIMITED', 'Too many attempts. Please wait 15 minutes and try again.');
    }
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
