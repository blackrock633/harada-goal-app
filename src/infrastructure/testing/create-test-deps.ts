import { Deps } from '@/application/ports';
import { Database, createDatabase } from '../db/client';
import { createUnitOfWork } from '../db/unit-of-work';
import { Argon2PasswordHasher } from '../auth/password-hasher';
import { CryptoSessionTokens } from '../auth/session-tokens';
import { InMemoryRateLimiter } from '../auth/rate-limiter';
import { ConsoleLogger } from '../logger';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let templateDbPromise: Promise<string> | null = null;

export async function createTestDeps(options?: { fastHashing?: boolean }): Promise<{ deps: Deps; db: Database; close(): Promise<void> }> {
  // Use PGlite data dump to dramatically speed up test DB creation.
  if (!templateDbPromise) {
    templateDbPromise = (async () => {
      const { PGlite } = await import('@electric-sql/pglite');
      const { migrate } = await import('drizzle-orm/pglite/migrator');
      const { drizzle } = await import('drizzle-orm/pglite');
      const dumpDir = path.join(process.cwd(), '.data/test-template-' + Date.now());
      fs.mkdirSync(dumpDir, { recursive: true });
      const templateClient = new PGlite(dumpDir);
      const templateDb = drizzle(templateClient);
      await migrate(templateDb, { migrationsFolder: './drizzle' });
      await templateClient.close();
      return dumpDir;
    })();
  }

  const dumpDir = await templateDbPromise;
  const testDir = path.join(process.cwd(), '.data/test-' + crypto.randomUUID());
  fs.cpSync(dumpDir, testDir, { recursive: true });
  
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const client = new PGlite(testDir);
  const db = drizzle(client) as unknown as Database;

  const deps: Deps = {
    uow: createUnitOfWork(db),
    ids: () => crypto.randomUUID(),
    passwords: new Argon2PasswordHasher({ fastHashing: options?.fastHashing }),
    tokens: new CryptoSessionTokens(),
    rateLimiter: new InMemoryRateLimiter(),
    logger: new ConsoleLogger(),
  };

  return {
    deps,
    db,
    close: async () => {
      await client.close();
    },
  };
}
