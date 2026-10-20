import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import { createTestDeps, type TestDeps } from '../testing/create-test-deps';

describe('schema.ts matches the migrated database', () => {
  let t: TestDeps;
  beforeAll(async () => {
    t = await createTestDeps();
  });
  afterAll(() => t.close());

  const tables = (Object.values(schema) as unknown[]).filter((v): v is PgTable => v instanceof PgTable);

  it('finds the expected tables', () => {
    const names = tables.map((x) => getTableConfig(x)).filter((c) => (c.schema ?? 'public') === 'public').map((c) => c.name);
    expect(names.sort()).toEqual(['actions', 'daily_focus', 'goal_events', 'goals', 'outcomes', 'profiles', 'reflections', 'routine_checks']);
  });

  for (const table of tables) {
    const cfg = getTableConfig(table);
    if ((cfg.schema ?? 'public') !== 'public') continue;
    it(`columns of ${cfg.name}`, async () => {
      const res = await t.client.query<{ column_name: string; is_nullable: string }>(
        `select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = $1`,
        [cfg.name],
      );
      const db = new Map(res.rows.map((r) => [r.column_name, r.is_nullable === 'YES']));
      for (const col of cfg.columns) {
        expect(db.has(col.name), `${cfg.name}.${col.name} missing in database`).toBe(true);
        expect(db.get(col.name), `${cfg.name}.${col.name} nullability`).toBe(!col.notNull);
      }
      // Reverse direction: a DB column absent from schema.ts would be silently unreadable.
      const known = new Set(cfg.columns.map((c) => c.name));
      for (const name of db.keys()) expect(known.has(name), `${cfg.name}.${name} missing in schema.ts`).toBe(true);
    });
  }
});
