import { sql } from 'drizzle-orm';
import type { Id } from '@/domain/types';
import { UnitOfWork, Repos } from '@/application/ports';
import { Database } from './client';
import { mapPgError } from './pg-errors';
import { ProfileRepoImpl } from './repositories/profile-repo';
import { GoalRepoImpl } from './repositories/goal-repo';
import { OutcomeRepoImpl } from './repositories/outcome-repo';
import { ActionRepoImpl } from './repositories/action-repo';
import { RoutineCheckRepoImpl } from './repositories/routine-check-repo';
import { ReflectionRepoImpl } from './repositories/reflection-repo';
import { GoalEventRepoImpl } from './repositories/goal-event-repo';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every transaction runs as the Postgres `authenticated` role with `request.jwt.claims.sub = userId`
 * (both transaction-local), so Supabase RLS policies apply exactly as they would for a supabase-js
 * client holding that user's JWT. The connection's own role is never used for app queries.
 */
export function createUnitOfWork(db: Database): UnitOfWork {
  return {
    async run<T>(userId: Id, fn: (repos: Repos) => Promise<T>): Promise<T> {
      if (!UUID_RE.test(userId)) throw new Error('UnitOfWork.run requires a verified user id');
      const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
      try {
        return await db.transaction(async (tx) => {
          await tx.execute(
            sql`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${claims}, true)`,
          );
          const repos: Repos = {
            profiles: new ProfileRepoImpl(tx),
            goals: new GoalRepoImpl(tx),
            outcomes: new OutcomeRepoImpl(tx),
            actions: new ActionRepoImpl(tx),
            checks: new RoutineCheckRepoImpl(tx),
            reflections: new ReflectionRepoImpl(tx),
            events: new GoalEventRepoImpl(tx),
          };
          return fn(repos);
        });
      } catch (e) {
        throw mapPgError(e);
      }
    },
  };
}
