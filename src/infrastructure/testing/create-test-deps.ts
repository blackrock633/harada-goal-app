import crypto from 'crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { Deps } from '@/application/ports';
import type { Id } from '@/domain/types';
import { Database } from '../db/client';
import { applyLocalMigrations } from '../db/migrations';
import { createUnitOfWork } from '../db/unit-of-work';
import { InMemoryRateLimiter } from '../auth/rate-limiter';
import { ConsoleLogger } from '../logger';
import * as schema from '../db/schema';
import { FakeAuthGateway } from './fake-auth-gateway';

/**
 * Real Postgres (PGlite) with the Supabase auth shim and every migration applied, so RLS, constraints
 * and triggers are exercised for real. Supabase Auth itself (GoTrue) is replaced by FakeAuthGateway,
 * which creates rows in the emulated auth.users table (firing the real profile trigger).
 *
 * The migrated template is built once per worker and kept in memory; each test DB loads from it, so
 * nothing is written to disk.
 */
let templatePromise: Promise<File | Blob> | null = null;

function buildTemplate(): Promise<File | Blob> {
  return (async () => {
    const client = new PGlite();
    await applyLocalMigrations(client);
    const dump = await client.dumpDataDir('none');
    await client.close();
    return dump;
  })();
}

export interface TestDeps {
  deps: Deps;
  /** Admin connection (postgres role, bypasses RLS). Use for setup/inspection only. */
  db: Database;
  client: PGlite;
  auth: FakeAuthGateway;
  /** Creates an auth user (and, via the trigger, a profile). Returns its id. */
  createUser(opts?: { email?: string; displayName?: string; timeZone?: string }): Promise<Id>;
  close(): Promise<void>;
}

export async function createTestDeps(): Promise<TestDeps> {
  templatePromise ??= buildTemplate();
  const client = new PGlite({ loadDataDir: await templatePromise });
  const db = drizzle(client, { schema }) as unknown as Database;
  const auth = new FakeAuthGateway(client);

  const deps: Deps = {
    uow: createUnitOfWork(db),
    ids: () => crypto.randomUUID(),
    auth,
    rateLimiter: new InMemoryRateLimiter(),
    logger: new ConsoleLogger(),
  };

  return {
    deps,
    db,
    client,
    auth,
    async createUser(opts = {}) {
      const { user } = await auth.signUp({
        email: opts.email ?? `user-${crypto.randomUUID()}@example.test`,
        password: 'correct horse battery',
        displayName: opts.displayName ?? 'Test User',
        timeZone: opts.timeZone ?? 'UTC',
      });
      return user.id;
    },
    close: () => client.close(),
  };
}
