/* eslint-disable @typescript-eslint/no-explicit-any */
import { drizzle, PgDatabase } from 'drizzle-orm/pg-core';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

import * as schema from './schema';

export type Database = PgDatabase<any, typeof schema>;

const globalForDb = globalThis as unknown as {
  db?: Database;
};

export async function createDatabase(url: string): Promise<Database> {
  if (url === 'memory://') {
    const client = new PGlite();
    const db = drizzlePglite(client, { schema });
    await migratePglite(db, { migrationsFolder: './drizzle' });
    return db as unknown as Database;
  }

  if (url.startsWith('pglite://')) {
    const dataDir = url.replace('pglite://', '');
    fs.mkdirSync(dataDir, { recursive: true });
    const client = new PGlite(dataDir);
    const db = drizzlePglite(client, { schema });
    await migratePglite(db, { migrationsFolder: './drizzle' });
    return db as unknown as Database;
  }

  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const client = postgres(url);
    const db = drizzlePostgres(client, { schema });
    return db as unknown as Database;
  }

  throw new Error(`Unsupported DATABASE_URL: ${url}`);
}

export async function getDb(): Promise<Database> {
  if (globalForDb.db) {
    return globalForDb.db;
  }

  let url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL is required in production');
    }
    url = 'pglite://.data/dev';
  }

  const db = await createDatabase(url);
  globalForDb.db = db;
  return db;
}
