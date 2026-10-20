import { Deps } from '@/application/ports';
import { getDb } from './db/client';
import { createUnitOfWork } from './db/unit-of-work';
import { Argon2PasswordHasher } from './auth/password-hasher';
import { CryptoSessionTokens } from './auth/session-tokens';
import { InMemoryRateLimiter } from './auth/rate-limiter';
import { ConsoleLogger } from './logger';
import crypto from 'crypto';

let depsInstance: Deps | null = null;

export async function getDeps(): Promise<Deps> {
  if (depsInstance) {
    return depsInstance;
  }

  const db = await getDb();
  
  depsInstance = {
    uow: createUnitOfWork(db),
    ids: () => crypto.randomUUID(),
    passwords: new Argon2PasswordHasher(),
    tokens: new CryptoSessionTokens(),
    rateLimiter: new InMemoryRateLimiter(),
    logger: new ConsoleLogger(),
  };

  return depsInstance;
}
