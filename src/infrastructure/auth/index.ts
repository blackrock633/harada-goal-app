import type { AuthGateway } from '@/application/ports';
import type { Database } from '../db/client';
import { DevAuthGateway } from './dev-auth-gateway';
import { isDevAuthEnabled } from './mode';
import { SupabaseAuthGateway } from './supabase-auth-gateway';

/**
 * Supabase Auth by default. The dev gateway is selected only by AUTH_PROVIDER=dev outside production
 * and needs the (local PGlite) database. Both gateways read the current request's cookies on every
 * call, so a single instance can live in a process-wide Deps singleton.
 */
export function createAuthGateway(db?: Database): AuthGateway {
  if (process.env.AUTH_PROVIDER === 'dev') {
    if (!isDevAuthEnabled()) throw new Error('AUTH_PROVIDER=dev is not allowed in production');
    if (!db) throw new Error('createAuthGateway(db) requires the database for dev auth');
    return new DevAuthGateway(db);
  }
  return new SupabaseAuthGateway();
}
