/**
 * A chainable fake of the supabase-js surface the data layer uses. It records every
 * from().select()... call and answers from in-memory rows, applying eq/in/gte/order/limit like
 * PostgREST would, so loaders can be checked against the read model on the same rows.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;
type PgError = { code?: string; message?: string; hint?: string } | null;

export interface RecordedQuery {
  table: string;
  columns: string;
  filters: string[];
}

export interface RpcReply {
  data?: unknown;
  error?: PgError;
  status?: number;
  throws?: boolean;
}

export function createFakeSupabase(tables: Record<string, Row[]>, rpcReplies: Record<string, RpcReply> = {}) {
  const queries: RecordedQuery[] = [];
  const failing = new Map<string, PgError>();
  const rpc = jest.fn(async (name: string, args: { p_input: unknown }) => {
    void args;
    const reply = rpcReplies[name] ?? { data: null, error: null, status: 200 };
    if (reply.throws) throw new Error('network down');
    return { data: reply.data ?? null, error: reply.error ?? null, status: reply.status ?? 200 };
  });

  function from(table: string) {
    return {
      select(columns: string) {
        const rec: RecordedQuery = { table, columns, filters: [] };
        queries.push(rec);
        let rows = [...(tables[table] ?? [])];
        const orders: { col: string; asc: boolean }[] = [];
        let max = Infinity;
        const builder = {
          eq(c: string, v: unknown) {
            rec.filters.push(`eq ${c} ${String(v)}`);
            rows = rows.filter((r) => r[c] === v);
            return builder;
          },
          in(c: string, vs: unknown[]) {
            rec.filters.push(`in ${c} ${vs.join('|')}`);
            rows = rows.filter((r) => vs.includes(r[c]));
            return builder;
          },
          gte(c: string, v: unknown) {
            rec.filters.push(`gte ${c} ${String(v)}`);
            rows = rows.filter((r) => String(r[c]) >= String(v));
            return builder;
          },
          order(c: string, o?: { ascending?: boolean }) {
            rec.filters.push(`order ${c} ${o?.ascending === false ? 'desc' : 'asc'}`);
            orders.push({ col: c, asc: o?.ascending !== false });
            return builder;
          },
          limit(n: number) {
            rec.filters.push(`limit ${n}`);
            max = n;
            return builder;
          },
          then<R1, R2>(ok: (v: unknown) => R1, bad: (e: unknown) => R2) {
            const err = failing.get(table);
            const sorted = [...rows].sort((a, b) => {
              for (const { col, asc } of orders) {
                const x = String(a[col] ?? '');
                const y = String(b[col] ?? '');
                if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
              }
              return 0;
            });
            const res = err
              ? { data: null, error: err, status: 500 }
              : { data: sorted.slice(0, max), error: null, status: 200 };
            return Promise.resolve(res).then(ok, bad);
          },
        };
        return builder;
      },
    };
  }

  return {
    client: { from, rpc } as unknown as SupabaseClient,
    rpc,
    queries,
    /** Make every select on `table` fail with this PostgREST error. */
    failTable: (table: string, error: PgError) => failing.set(table, error),
  };
}
