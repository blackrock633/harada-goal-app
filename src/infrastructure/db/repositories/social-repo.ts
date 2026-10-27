/* eslint-disable @typescript-eslint/no-explicit-any */
import { sql } from 'drizzle-orm';
import { PgTransaction } from 'drizzle-orm/pg-core';
import type { SocialRepo } from '@/application/ports';

const ALLOWED_SOCIAL_RPCS = new Set([
  'get_social_profile',
  'update_social_profile',
  'set_goal_visibility',
  'get_goal_visibility',
  'follow_user',
  'unfollow_user',
  'block_user',
  'unblock_user',
  'list_follow_connections',
  'discover_users',
  'create_social_post',
  'update_social_post',
  'delete_social_post',
  'get_social_feed',
  'get_social_post',
  'get_post_image',
  'toggle_post_like',
  'add_post_comment',
  'delete_post_comment',
  'hide_or_report_post',
  'list_social_notifications',
  'mark_notifications_read',
]);

export class SocialRepoImpl implements SocialRepo {
  constructor(private readonly tx: PgTransaction<any, any, any>) {}

  async callRpc<T>(name: string, input: Record<string, unknown> = {}): Promise<T> {
    if (!ALLOWED_SOCIAL_RPCS.has(name)) {
      throw new Error(`Disallowed social RPC: ${name}`);
    }
    const payload = JSON.stringify(input);
    const fnIdent = sql.raw(`public.${name}`);
    const raw = await this.tx.execute(sql`select ${fnIdent}(${payload}::jsonb) as res`);
    const rows = Array.isArray(raw) ? raw : (raw?.rows ?? []);
    const val = rows[0]?.res;
    return (typeof val === 'string' ? JSON.parse(val) : val) as T;
  }
}
