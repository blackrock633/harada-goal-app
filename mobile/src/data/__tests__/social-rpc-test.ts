import fs from 'node:fs';
import path from 'node:path';

import * as social from '../social';

const mockRpc = jest.fn();
jest.mock('../supabase', () => ({ getSupabase: () => ({ rpc: (...a: unknown[]) => mockRpc(...a) }) }));

/** The argument name each social function declares, read from the migration itself. */
function declaredArgs(): Record<string, string> {
  const sql = fs.readFileSync(path.join(__dirname, '../../../../supabase/migrations/20261026160000_social_community.sql'), 'utf8');
  const out: Record<string, string> = {};
  for (const m of sql.matchAll(/^create function public\.([a-z_]+)\((p_input|p) jsonb/gm)) out[m[1]!] = m[2]!;
  return out;
}

beforeEach(() => mockRpc.mockReset().mockResolvedValue({ data: {}, error: null }));

it('every call names its input as the database function declares it (PostgREST matches by name)', async () => {
  const args = declaredArgs();
  const calls: [string, () => Promise<unknown>][] = [
    ['get_social_profile', () => social.fetchSocialProfile({})],
    ['update_social_profile', () => social.updateSocialProfile({ bio: 'x' })],
    ['follow_user', () => social.followUser('u')],
    ['get_social_feed', () => social.fetchSocialFeed({})],
    ['add_post_comment', () => social.addPostComment('p', 'hi')],
    ['get_social_post', () => social.getSocialPost('p')],
    ['get_post_image', () => social.getPostImage('p')],
    ['list_social_notifications', () => social.listSocialNotifications()],
  ];
  for (const [fn, call] of calls) {
    mockRpc.mockClear();
    await call();
    const [name, params] = mockRpc.mock.calls[0]!;
    expect(name).toBe(fn);
    expect(Object.keys(params as object)).toEqual([args[fn]]);
  }
});
