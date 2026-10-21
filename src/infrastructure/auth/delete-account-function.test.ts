import { describe, expect, it, vi } from 'vitest';
import { handleDeleteAccount, type DeleteAccountDeps } from '../../../supabase/functions/delete-account/handler';

/** Logic of the delete-account Edge Function with Supabase Auth mocked (the Deno wiring is untested here). */
const ALICE = { id: '11111111-1111-4111-8111-111111111111', email: 'alice@example.com' };

function deps(over: Partial<DeleteAccountDeps> = {}) {
  return {
    getUser: vi.fn(async (token: string) => (token === 'good' ? ALICE : null)),
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
});
