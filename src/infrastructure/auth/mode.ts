/**
 * Dev auth is for local development without Supabase only. Allow-list, not deny-list: it requires an
 * explicit development/test NODE_ENV AND a local embedded database, so a misconfigured staging or
 * production deploy (NODE_ENV unset, 'staging', a real DATABASE_URL) can never enable it.
 */
export function isDevAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.AUTH_PROVIDER !== 'dev') return false;
  if (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') return false;
  const url = env.DATABASE_URL;
  return url === undefined || url === '' || url === 'memory://' || url.startsWith('pglite://');
}

export const DEV_AUTH_COOKIE = 'harada_dev_session';
