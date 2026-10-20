/** Dev auth is for local development without Supabase only; it can never be enabled in production. */
export function isDevAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUTH_PROVIDER === 'dev' && env.NODE_ENV !== 'production';
}

export const DEV_AUTH_COOKIE = 'harada_dev_session';
