import { localDateInZone } from '@/domain/dates';
import type { Deps } from './ports';
import { Ctx } from './result';
import { UserDTO } from './dto';
import { AppFail, guard } from './errors';
import type { Result } from './result';

export type { Ctx, Deps };

export function makeCtx(userId: string, timeZone: string, now: Date = new Date()): Ctx {
  return { userId, now, today: localDateInZone(now, timeZone) };
}

/**
 * Verified session -> Ctx + user. Delivery layer calls this once per request.
 * Fails UNAUTHENTICATED when there is no session (or no profile row).
 */
export async function resolveCtx(deps: Deps, now: Date = new Date()): Promise<Result<{ ctx: Ctx; user: UserDTO }>> {
  return guard(deps.logger, async () => {
    const authUser = await deps.auth.getUser();
    if (!authUser) throw new AppFail('UNAUTHENTICATED', 'Please sign in');
    const profile = await deps.uow.run(authUser.id, (r) => r.profiles.findById(authUser.id));
    if (!profile) throw new AppFail('UNAUTHENTICATED', 'Please sign in');
    return {
      ctx: makeCtx(authUser.id, profile.timeZone, now),
      user: { id: authUser.id, email: authUser.email, displayName: profile.displayName, timeZone: profile.timeZone },
    };
  });
}

