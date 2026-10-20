import fs from 'fs';
import path from 'path';
import type { PGlite } from '@electric-sql/pglite';

/**
 * Applies supabase/migrations/*.sql to a LOCAL PGlite database, preceded by the test-only auth shim
 * (supabase/tests/auth-shim.sql) that emulates Supabase's auth schema, roles and auth.uid().
 *
 * Real Supabase databases are migrated with the Supabase CLI (`supabase db push`), never with this.
 */
const ROOT = process.cwd();
export const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const SHIM_FILE = path.join(ROOT, 'supabase', 'tests', 'auth-shim.sql');

export function listMigrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort();
}

export async function applyLocalMigrations(client: PGlite): Promise<void> {
  await client.exec(fs.readFileSync(SHIM_FILE, 'utf8'));
  await client.exec(
    `create schema if not exists app_meta;
     create table if not exists app_meta.schema_migrations (version text primary key, applied_at timestamptz not null default now());`,
  );
  const applied = new Set(
    (await client.query<{ version: string }>('select version from app_meta.schema_migrations')).rows.map(
      (r) => r.version,
    ),
  );
  for (const file of listMigrationFiles()) {
    const version = file.slice(0, 14);
    if (applied.has(version)) continue;
    const sqlText = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await client.transaction(async (tx) => {
      await tx.exec(sqlText);
      await tx.query('insert into app_meta.schema_migrations (version) values ($1)', [version]);
    });
  }
}
