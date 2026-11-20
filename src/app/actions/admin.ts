'use server';

import { z } from 'zod';
import { auditReasonSchema, parseMemberSearch, type MemberSearchResultDTO } from '@/application/admin-identity';
import { userSupabase } from '@/infrastructure/supabase/server';

/**
 * Founding Member administration. Each call runs as the signed-in user, and each database function checks
 * public.admins itself (HG403 otherwise), so these actions grant nothing on their own. Grants go through
 * admin_entitlement(..., 'founding', ...), the payments-owned path that also applies the complimentary-Pro setting.
 */
export type AdminActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

const userIdSchema = z.uuid({ message: 'Invalid user id' });

async function call<T>(fn: string, args: Record<string, unknown>, map: (data: unknown) => T | null): Promise<AdminActionResult<T>> {
  try {
    const client = await userSupabase();
    if (!client) return { ok: false, message: 'Administration needs the Supabase connection, which is not configured.' };
    const { data, error } = await client.rpc(fn, args);
    if (error) {
      const code = (error as { code?: string }).code ?? '';
      // Database-raised HG* errors carry user-facing messages; anything else stays generic.
      return { ok: false, message: code.startsWith('HG') ? error.message : 'Something went wrong. Try again.' };
    }
    const mapped = map(data);
    return mapped === null ? { ok: false, message: 'Unexpected response.' } : { ok: true, data: mapped };
  } catch {
    return { ok: false, message: 'Something went wrong. Try again.' };
  }
}

export async function searchMembersAction(query: string): Promise<AdminActionResult<MemberSearchResultDTO[]>> {
  const q = z.string().trim().min(2, 'Type at least 2 characters').max(80).safeParse(query);
  if (!q.success) return { ok: false, message: q.error.issues[0]!.message };
  return call('admin_search_users', { p_input: { query: q.data } }, parseMemberSearch);
}

export async function grantFoundingAction(userId: string, reason: string): Promise<AdminActionResult<true>> {
  const id = userIdSchema.safeParse(userId);
  const r = auditReasonSchema.safeParse(reason);
  if (!id.success) return { ok: false, message: 'Invalid user' };
  if (!r.success) return { ok: false, message: r.error.issues[0]!.message };
  return call('admin_entitlement', { p_user: id.data, p_action: 'founding', p_reason: r.data }, () => true);
}

export async function revokeFoundingAction(userId: string, reason: string): Promise<AdminActionResult<true>> {
  const id = userIdSchema.safeParse(userId);
  const r = auditReasonSchema.safeParse(reason);
  if (!id.success) return { ok: false, message: 'Invalid user' };
  if (!r.success) return { ok: false, message: r.error.issues[0]!.message };
  return call('admin_revoke_founding_member', { p_input: { userId: id.data, reason: r.data } }, () => true);
}
