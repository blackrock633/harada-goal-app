/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReflectionRepo } from '@/application/ports';
import { Reflection, ReflectionKind, ReviewAnswers, Id, LocalDate } from '@/domain/types';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { reflections, goals } from '../schema';
import { eq, and, desc, lt, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export class ReflectionRepoImpl implements ReflectionRepo {
  constructor(private readonly tx: PgTransaction<any, any, any>) {}

  async findById(ownerId: Id, reflectionId: Id): Promise<Reflection | null> {
    const rows = await this.tx
      .select({ reflection: reflections })
      .from(reflections)
      .innerJoin(goals, eq(reflections.goalId, goals.id))
      .where(and(eq(reflections.id, reflectionId), eq(goals.ownerId, ownerId)));

    if (rows.length === 0) {
      await this.tx.execute(sql`select harada_private.check_reflection_access(${reflectionId}::uuid)`);
      return null;
    }
    return this.mapToDomain(rows[0]!.reflection);
  }

  async listByGoal(goalId: Id, opts: { limit: number; before?: LocalDate }): Promise<Reflection[]> {
    let query = this.tx
      .select()
      .from(reflections)
      .where(eq(reflections.goalId, goalId));

    if (opts.before) {
      query = this.tx
        .select()
        .from(reflections)
        .where(and(eq(reflections.goalId, goalId), lt(reflections.date, opts.before)));
    }

    const rows = await query.orderBy(desc(reflections.date), desc(reflections.createdAt)).limit(opts.limit);
    return rows.map(this.mapToDomain);
  }

  async latestDateByGoals(goalIds: Id[]): Promise<Record<Id, LocalDate>> {
    if (goalIds.length === 0) return {};

    const rows = await this.tx
      .select({
        goalId: reflections.goalId,
        maxDate: sql<string>`max(${reflections.date})`,
      })
      .from(reflections)
      .where(inArray(reflections.goalId, goalIds))
      .groupBy(reflections.goalId);

    const result: Record<Id, LocalDate> = {};
    for (const row of rows) {
      result[row.goalId] = row.maxDate;
    }
    return result;
  }

  async insert(reflection: Reflection): Promise<void> {
    await this.tx.insert(reflections).values({
      id: reflection.id,
      goalId: reflection.goalId,
      date: reflection.date,
      kind: reflection.kind,
      wentWell: reflection.wentWell,
      didntGoWell: reflection.didntGoWell,
      nextChange: reflection.nextChange,
      createdAt: reflection.createdAt,
      updatedAt: reflection.updatedAt,
    });
  }

  async update(reflection: Reflection): Promise<void> {
    await this.tx
      .update(reflections)
      .set({
        wentWell: reflection.wentWell,
        didntGoWell: reflection.didntGoWell,
        nextChange: reflection.nextChange,
        updatedAt: reflection.updatedAt,
      })
      .where(eq(reflections.id, reflection.id));
  }

  async deleteById(reflectionId: Id): Promise<void> {
    await this.tx.delete(reflections).where(eq(reflections.id, reflectionId));
  }

  private mapToDomain(row: typeof reflections.$inferSelect): Reflection {
    return {
      id: row.id,
      goalId: row.goalId,
      date: row.date,
      kind: row.kind as ReflectionKind,
      wentWell: row.wentWell,
      didntGoWell: row.didntGoWell,
      nextChange: row.nextChange,
      answers: (row.answers ?? {}) as ReviewAnswers,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
