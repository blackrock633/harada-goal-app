import crypto from 'crypto';
import type { Deps } from '@/application/ports';
import { getDb } from './db/client';
import { createUnitOfWork } from './db/unit-of-work';
import { createAuthGateway } from './auth';
import { InMemoryRateLimiter } from './auth/rate-limiter';
import { ConsoleLogger } from './logger';

let depsPromise: Promise<Deps> | null = null;

export function getDeps(): Promise<Deps> {
  depsPromise ??= (async () => {
    const db = await getDb();
    return {
      uow: createUnitOfWork(db),
      ids: () => crypto.randomUUID(),
      auth: createAuthGateway(db),
      rateLimiter: new InMemoryRateLimiter(),
      logger: new ConsoleLogger(),
    };
  })().catch((e) => {
    depsPromise = null;
    throw e;
  });
  return depsPromise;
}
