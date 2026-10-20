/* eslint-disable @typescript-eslint/no-explicit-any */
import { DailyFocusRepo } from '@/application/ports';
import { DailyFocus, Id, LocalDate } from '@/domain/types';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { dailyFocus } from '../schema';
import { eq, and, asc } from 'drizzle-orm';

export class DailyFocusRepoImpl implements DailyFocusRepo {
  constructor(private readonly tx: PgTransaction<any, any, any>) {}

  async listForDate(ownerId: Id, date: LocalDate): Promise<DailyFocus[]> {
    const rows = await this.tx
      .select()
      .from(dailyFocus)
      .where(and(eq(dailyFocus.ownerId, ownerId), eq(dailyFocus.date, date)))
      .orderBy(asc(dailyFocus.slot));
    return rows.map((row) => ({
      id: row.id,
      ownerId: row.ownerId,
      actionId: row.actionId,
      date: row.date,
      slot: row.slot,
      createdAt: row.createdAt,
    }));
  }

  async add(focus: DailyFocus): Promise<boolean> {
    // Only the (action_id, date) duplicate is a no-op; a taken slot still raises (→ CONFLICT).
    const inserted = await this.tx
      .insert(dailyFocus)
      .values(focus)
      .onConflictDoNothing({ target: [dailyFocus.actionId, dailyFocus.date] })
      .returning({ id: dailyFocus.id });
    return inserted.length > 0;
  }

  async remove(ownerId: Id, actionId: Id, date: LocalDate): Promise<void> {
    await this.tx
      .delete(dailyFocus)
      .where(and(eq(dailyFocus.ownerId, ownerId), eq(dailyFocus.actionId, actionId), eq(dailyFocus.date, date)));
  }
}
