import { revalidatePath } from 'next/cache';
import { fail, type Ctx, type Result } from '@/application/result';
import type { Deps } from '@/application/ports';
import { getDeps } from '@/infrastructure/container';
import { getCtx } from '@/app/lib/session';

/**
 * Shared body of every authenticated server action: resolve the session, run the use case,
 * revalidate on success. Use cases already map their own failures to Result (guard()); this
 * only catches infrastructure failures before/around them (DB unreachable, session lookup).
 */
export async function runAuthed<T>(fn: (deps: Deps, ctx: Ctx) => Promise<Result<T>>): Promise<Result<T>> {
  let ctx: Ctx | null;
  try {
    ctx = await getCtx();
  } catch (err) {
    console.error('session lookup failed', err);
    return fail('UNAVAILABLE', "Couldn't reach the server.");
  }
  if (!ctx) return fail('UNAUTHENTICATED', 'Please sign in again.');

  let result: Result<T>;
  try {
    const deps = await getDeps();
    result = await fn(deps, ctx);
  } catch (err) {
    console.error('server action failed', err);
    return fail('UNAVAILABLE', "Couldn't reach the server.");
  }
  // Every page reads from the same goal graph, so refresh the whole app tree after a write.
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
