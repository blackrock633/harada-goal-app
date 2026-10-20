import { isValidTimeZone } from '@/domain/dates';
import type { UserDTO } from '../dto';
import { AppFail, guard } from '../errors';
import type { Deps } from '../ports';
import type { Ctx, Result } from '../result';
import {
  changePasswordSchema,
  deleteAccountSchema,
  signInSchema,
  signUpSchema,
  updateProfileSchema,
} from '../schemas';

const SIGN_IN_LIMIT = { limit: 10, windowMs: 15 * 60_000 };
const SIGN_UP_LIMIT = { limit: 5, windowMs: 60 * 60_000 };

function throttle(deps: Deps, key: string, cfg: { limit: number; windowMs: number }) {
  if (!deps.rateLimiter.consume(key, cfg.limit, cfg.windowMs)) {
    throw new AppFail('RATE_LIMITED', 'Too many attempts. Please wait a moment and try again.');
  }
}

async function userDTO(deps: Deps, id: string, email: string): Promise<UserDTO> {
  const profile = await deps.uow.run(id, (r) => r.profiles.findById(id));
  if (!profile) throw new AppFail('UNAUTHENTICATED', 'Please sign in');
  return { id, email, displayName: profile.displayName, timeZone: profile.timeZone };
}

export async function signUp(
  deps: Deps,
  input: unknown,
): Promise<Result<{ userId: string; needsEmailConfirmation: boolean }>> {
  return guard(deps.logger, async () => {
    const data = signUpSchema.parse(input);
    if (!isValidTimeZone(data.timeZone)) {
      throw new AppFail('VALIDATION', 'Unknown time zone', { timeZone: ['Unknown time zone'] });
    }
    throttle(deps, `signup:${data.email}`, SIGN_UP_LIMIT);
    const { user, confirmed } = await deps.auth.signUp(data);
    return { userId: user.id, needsEmailConfirmation: !confirmed };
  });
}

export async function signIn(deps: Deps, input: unknown): Promise<Result<UserDTO>> {
  return guard(deps.logger, async () => {
    const data = signInSchema.parse(input);
    throttle(deps, `signin:${data.email}`, SIGN_IN_LIMIT);
    const user = await deps.auth.signIn(data.email, data.password);
    return userDTO(deps, user.id, user.email);
  });
}

export async function signOut(deps: Deps): Promise<Result<null>> {
  return guard(deps.logger, async () => {
    await deps.auth.signOut();
    return null;
  });
}

/** `data: null` means no valid session (not an error). */
export async function getCurrentUser(deps: Deps): Promise<Result<UserDTO | null>> {
  return guard(deps.logger, async () => {
    const user = await deps.auth.getUser();
    if (!user) return null;
    const profile = await deps.uow.run(user.id, (r) => r.profiles.findById(user.id));
    if (!profile) return null;
    return { id: user.id, email: user.email, displayName: profile.displayName, timeZone: profile.timeZone };
  });
}

export async function updateProfile(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<UserDTO>> {
  return guard(deps.logger, async () => {
    const data = updateProfileSchema.parse(input);
    if (data.timeZone !== undefined && !isValidTimeZone(data.timeZone)) {
      throw new AppFail('VALIDATION', 'Unknown time zone', { timeZone: ['Unknown time zone'] });
    }
    const authUser = await deps.auth.getUser();
    if (!authUser || authUser.id !== ctx.userId) throw new AppFail('UNAUTHENTICATED', 'Please sign in');
    const profile = await deps.uow.run(ctx.userId, (r) =>
      r.profiles.update(ctx.userId, { ...data, updatedAt: ctx.now }),
    );
    return { id: ctx.userId, email: authUser.email, displayName: profile.displayName, timeZone: profile.timeZone };
  });
}

export async function changePassword(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<null>> {
  return guard(deps.logger, async () => {
    const data = changePasswordSchema.parse(input);
    const authUser = await deps.auth.getUser();
    if (!authUser || authUser.id !== ctx.userId) throw new AppFail('UNAUTHENTICATED', 'Please sign in');
    throttle(deps, `pw:${ctx.userId}`, SIGN_IN_LIMIT);
    if (!(await deps.auth.verifyPassword(authUser.email, data.currentPassword))) {
      throw new AppFail('VALIDATION', 'Current password is incorrect', {
        currentPassword: ['Current password is incorrect'],
      });
    }
    await deps.auth.updatePassword(data.newPassword);
    return null;
  });
}

export async function deleteAccount(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<null>> {
  return guard(deps.logger, async () => {
    const data = deleteAccountSchema.parse(input);
    const authUser = await deps.auth.getUser();
    if (!authUser || authUser.id !== ctx.userId) throw new AppFail('UNAUTHENTICATED', 'Please sign in');
    throttle(deps, `pw:${ctx.userId}`, SIGN_IN_LIMIT);
    if (!(await deps.auth.verifyPassword(authUser.email, data.password))) {
      throw new AppFail('VALIDATION', 'Password is incorrect', { password: ['Password is incorrect'] });
    }
    await deps.auth.deleteUser(ctx.userId);
    await deps.auth.signOut();
    return null;
  });
}

