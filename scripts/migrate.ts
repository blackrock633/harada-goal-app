import { createDatabase } from '../src/infrastructure/db/client';

/**
 * Applies `supabase/migrations/` to a local PGlite database (with the test-only auth shim).
 * Real Postgres/Supabase databases are migrated with the Supabase CLI (`supabase db push`, see
 * docs/SUPABASE_SETUP.md), never from here: the shim must not reach a real project.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  if (!url.startsWith('pglite://')) {
    throw new Error('db:migrate only targets local pglite:// databases; use `supabase db push` for Supabase');
  }

  console.warn(`Applying local migrations to ${url}...`);
  await createDatabase(url);
  console.warn('Migrations complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
