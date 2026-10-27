import { describe, expect, it, vi } from 'vitest';
import { handleDeleteAccount, type DeleteAccountDeps } from '../../../supabase/functions/delete-account/handler';

/** Logic of the delete-account Edge Function with Supabase Auth mocked (the Deno wiring is untested here). */
const ALICE = { id: '11111111-1111-4111-8111-111111111111', email: 'alice@example.com' };

function deps(over: Partial<DeleteAccountDeps> = {}) {
  return {
    getUser: vi.fn(async (token: string) => (token === 'good' ? ALICE : null)),
    consumeAttempt: vi.fn(async () => true),
    verifyPassword: vi.fn(async (_email: string, pw: string) => pw === 'correct horse'),
    deleteUser: vi.fn(async () => {}),
    ...over,
  };
}

const req = (body: unknown, token: string | null = 'good', method = 'POST') =>
  new Request('https://x/functions/v1/delete-account', {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });

const send = async (r: Request, d = deps()) => {
  const res = await handleDeleteAccount(r, d);
  return { status: res.status, body: await res.json(), d };
};

describe('delete-account Edge Function handler', () => {
  it('deletes the caller after re-authentication', async () => {
    const { status, body, d } = await send(req({ password: 'correct horse', confirmation: 'DELETE' }));
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, data: null });
    expect(d.verifyPassword).toHaveBeenCalledWith(ALICE.email, 'correct horse');
    expect(d.deleteUser).toHaveBeenCalledWith(ALICE.id);
  });

  it('requires a valid session', async () => {
    for (const token of [null, 'expired']) {
      const { status, body, d } = await send(req({ password: 'correct horse', confirmation: 'DELETE' }, token));
      expect(status).toBe(401);
      expect(body.error.code).toBe('UNAUTHENTICATED');
      expect(d.deleteUser).not.toHaveBeenCalled();
    }
  });

  it('rejects a wrong password without deleting', async () => {
    const { status, body, d } = await send(req({ password: 'wrong', confirmation: 'DELETE' }));
    expect(status).toBe(400);
    expect(body.error).toMatchObject({ code: 'VALIDATION', fieldErrors: { password: ['Password is incorrect'] } });
    expect(d.deleteUser).not.toHaveBeenCalled();
  });

  it('requires the typed confirmation and a password, and a JSON POST', async () => {
    const { status, body, d } = await send(req({ password: '', confirmation: 'delete' }));
    expect(status).toBe(400);
    expect(Object.keys(body.error.fieldErrors).sort()).toEqual(['confirmation', 'password']);
    expect(d.getUser).not.toHaveBeenCalled();
    expect((await send(req('not json'))).status).toBe(400);
    expect((await send(req(null, 'good', 'GET'))).status).toBe(405);
  });

  it('a failed delete is reported honestly and leaks nothing', async () => {
    const logError = vi.fn();
    const failing = deps({ deleteUser: vi.fn(async () => { throw new Error('service role key invalid: sk_live_secret'); }), logError });
    const { status, body } = await send(req({ password: 'correct horse', confirmation: 'DELETE' }), failing);
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(logError).toHaveBeenCalled();
  });

  // SEC-EDGE-01: a stolen access token must not become an unlimited password oracle.
  it('stops checking passwords once the per-user attempt limit is used up', async () => {
    let n = 0;
    const d = deps({ consumeAttempt: vi.fn(async () => ++n <= 5) });
    for (let i = 0; i < 5; i++) expect((await send(req({ password: 'wrong', confirmation: 'DELETE' }), d)).status).toBe(400);
    const sixth = await send(req({ password: 'correct horse', confirmation: 'DELETE' }), d);
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('RATE_LIMITED');
    expect(d.verifyPassword).toHaveBeenCalledTimes(5);
    expect(d.deleteUser).not.toHaveBeenCalled();
    expect(d.consumeAttempt).toHaveBeenCalledWith(ALICE.id);
  });

  it('an Auth failure during the password check is a 500, not "incorrect password"', async () => {
    const d = deps({ verifyPassword: vi.fn(async () => { throw new Error('429 from auth'); }), logError: vi.fn() });
    const { status, body } = await send(req({ password: 'correct horse', confirmation: 'DELETE' }), d);
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL');
    expect(d.deleteUser).not.toHaveBeenCalled();
  });

  it('refuses oversized bodies before authenticating', async () => {
    const big = JSON.stringify({ password: 'x'.repeat(1_000_000), confirmation: 'DELETE' });
    const { status, d } = await send(req(big));
    expect(status).toBe(413);
    expect(d.getUser).not.toHaveBeenCalled();
  });

  it('answers CORS preflight only for allowed browser origins', async () => {
    const d = deps({ allowedOrigins: ['https://app.example'] });
    const pre = (origin: string) =>
      handleDeleteAccount(new Request('https://x/functions/v1/delete-account', { method: 'OPTIONS', headers: { origin } }), d);
    const ok = await pre('https://app.example');
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.example');
    const evil = await pre('https://evil.example');
    expect(evil.status).toBe(403);
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
    const post = await handleDeleteAccount(
      new Request('https://x/functions/v1/delete-account', {
        method: 'POST',
        headers: { origin: 'https://evil.example', authorization: 'Bearer good' },
        body: JSON.stringify({ password: 'correct horse', confirmation: 'DELETE' }),
      }),
      d,
    );
    expect(post.headers.get('access-control-allow-origin')).toBeNull();
  });
});
