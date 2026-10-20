import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { Ctx } from '@/application/result';
import { localDateInZone } from '@/domain/dates';
import { getDeps } from '@/infrastructure/container';

/**
 * Request context from the server-verified Supabase session (never from client input).
 * Memoised per request. null when signed out.
 */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const deps = await getDeps();
  const user = await deps.auth.getUser();
  if (!user) return null;
  const profile = await deps.uow.run(user.id, (r) => r.profiles.findById(user.id));
  const now = new Date();
  return { userId: user.id, now, today: localDateInZone(now, profile?.timeZone ?? 'UTC') };
});

export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect('/signin');
  return ctx;
}
