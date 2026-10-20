/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import fs from 'fs';

import * as schema from './schema';
import { applyLocalMigrations } from './migrations';

export type Database = PgDatabase<any, typeof schema>;

const globalForDb = globalThis as unknown as {
  db?: Promise<Database>;
};

/**
 * - `postgres://…` — Supabase Postgres (production). Use the pooler's transaction-mode URL; prepared
 *   statements are disabled because transaction pooling doesn't support them. Schema is managed by the
 *   Supabase CLI; this function never migrates a real database.
 * - `pglite://<dir>` / `memory://` — local embedded Postgres with the Supabase auth shim + migrations.
 */
export async function createDatabase(url: string): Promise<Database> {
  if (url === 'memory://' || url.startsWith('pglite://')) {
    const dataDir = url === 'memory://' ? undefined : url.slice('pglite://'.length);
    if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
    const client = new PGlite(dataDir);
    await applyLocalMigrations(client);
    return drizzlePglite(client, { schema }) as unknown as Database;
  }

  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const client = postgres(url, { prepare: false });
    return drizzlePostgres(client, { schema }) as unknown as Database;
  }

  throw new Error('Unsupported DATABASE_URL scheme');
}

export function getDb(): Promise<Database> {
  if (!globalForDb.db) {
    let url = process.env.DATABASE_URL;
    if (!url) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('DATABASE_URL is required in production');
      }
      url = 'pglite://.data/dev';
    }
    globalForDb.db = createDatabase(url).catch((e) => {
      globalForDb.db = undefined;
      throw e;
    });
  }
  return globalForDb.db;
}
