/* eslint-disable @typescript-eslint/no-explicit-any */
import { RoutineCheckRepo } from '@/application/ports';
import { RoutineCheck, Id, LocalDate } from '@/domain/types';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { routineChecks } from '../schema';
import { eq, and, inArray, asc, gte, lte } from 'drizzle-orm';

export class RoutineCheckRepoImpl implements RoutineCheckRepo {
  constructor(private readonly tx: PgTransaction<any, any, any>) {}

  async listForActions(actionIds: Id[], from: LocalDate, to: LocalDate): Promise<RoutineCheck[]> {
    if (actionIds.length === 0) return [];

    const rows = await this.tx
      .select()
      .from(routineChecks)
      .where(and(inArray(routineChecks.actionId, actionIds), gte(routineChecks.date, from), lte(routineChecks.date, to)))
      .orderBy(asc(routineChecks.date));

    return rows.map((row) => ({
      id: row.id,
      actionId: row.actionId,
      date: row.date,
      createdAt: row.createdAt,
    }));
  }

  async add(check: RoutineCheck): Promise<void> {
    await this.tx
      .insert(routineChecks)
      .values({
        id: check.id,
        actionId: check.actionId,
        date: check.date,
        createdAt: check.createdAt,
      })
      .onConflictDoNothing();
  }

  async remove(actionId: Id, date: LocalDate): Promise<void> {
    await this.tx.delete(routineChecks).where(and(eq(routineChecks.actionId, actionId), eq(routineChecks.date, date)));
  }
}
