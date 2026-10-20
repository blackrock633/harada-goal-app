/* eslint-disable @typescript-eslint/no-explicit-any */
import { GoalEventRepo } from '@/application/ports';
import { GoalEvent, GoalEventType, Id, Instant } from '@/domain/types';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { goalEvents } from '../schema';
import { eq, and, desc, lt } from 'drizzle-orm';

export class GoalEventRepoImpl implements GoalEventRepo {
  constructor(private readonly tx: PgTransaction<any, any, any>) {}

  async append(event: GoalEvent): Promise<void> {
    await this.tx.insert(goalEvents).values({
      id: event.id,
      goalId: event.goalId,
      type: event.type,
      subjectId: event.subjectId,
      summary: event.summary,
      data: event.data,
      occurredAt: event.occurredAt,
    });
  }

  async listByGoal(goalId: Id, opts: { limit: number; before?: Instant }): Promise<GoalEvent[]> {
    let query = this.tx
      .select()
      .from(goalEvents)
      .where(eq(goalEvents.goalId, goalId));

    if (opts.before) {
      query = this.tx
        .select()
        .from(goalEvents)
        .where(and(eq(goalEvents.goalId, goalId), lt(goalEvents.occurredAt, opts.before)));
    }

    const rows = await query.orderBy(desc(goalEvents.occurredAt)).limit(opts.limit);
    return rows.map((row) => ({
      id: row.id,
      goalId: row.goalId,
      type: row.type as GoalEventType,
      subjectId: row.subjectId,
      summary: row.summary,
      data: row.data as Record<string, unknown>,
      occurredAt: row.occurredAt,
    }));
  }
}
