/* eslint-disable @typescript-eslint/no-explicit-any */
import { OutcomeRepo, PositionUpdate } from '@/application/ports';
import { Outcome, Id } from '@/domain/types';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { outcomes, goals } from '../schema';
import { eq, and, inArray, asc } from 'drizzle-orm';

export class OutcomeRepoImpl implements OutcomeRepo {
  constructor(private readonly tx: PgTransaction<any, any, any>) {}

  async findById(ownerId: Id, outcomeId: Id): Promise<Outcome | null> {
    const rows = await this.tx
      .select({ outcome: outcomes })
      .from(outcomes)
      .innerJoin(goals, eq(outcomes.goalId, goals.id))
      .where(and(eq(outcomes.id, outcomeId), eq(goals.ownerId, ownerId)));

    if (rows.length === 0) return null;
    return this.mapToDomain(rows[0]!.outcome);
  }

  async listByGoals(goalIds: Id[]): Promise<Outcome[]> {
    if (goalIds.length === 0) return [];

    const rows = await this.tx
      .select()
      .from(outcomes)
      .where(inArray(outcomes.goalId, goalIds))
      .orderBy(asc(outcomes.position), asc(outcomes.createdAt));

    return rows.map(this.mapToDomain);
  }

  async insert(outcome: Outcome): Promise<void> {
    await this.tx.insert(outcomes).values({
      id: outcome.id,
      goalId: outcome.goalId,
      title: outcome.title,
      description: outcome.description,
      measureTarget: outcome.measure?.target ? String(outcome.measure.target) : null,
      measureCurrent: outcome.measure?.current !== undefined ? String(outcome.measure.current) : null,
      measureUnit: outcome.measure?.unit || null,
      position: outcome.position,
      archivedAt: outcome.archivedAt,
      createdAt: outcome.createdAt,
      updatedAt: outcome.updatedAt,
    });
  }

  async update(outcome: Outcome): Promise<void> {
    await this.tx
      .update(outcomes)
      .set({
        title: outcome.title,
        description: outcome.description,
        measureTarget: outcome.measure?.target ? String(outcome.measure.target) : null,
        measureCurrent: outcome.measure?.current !== undefined ? String(outcome.measure.current) : null,
        measureUnit: outcome.measure?.unit || null,
        position: outcome.position,
        archivedAt: outcome.archivedAt,
        updatedAt: outcome.updatedAt,
      })
      .where(eq(outcomes.id, outcome.id));
  }

  async setPositions(goalId: Id, updates: PositionUpdate[]): Promise<void> {
    if (updates.length === 0) return;

    const ids = updates.map((u) => u.id);

    // Phase 1: Bump affected rows to position + 100 to avoid partial unique index conflicts
    for (const update of updates) {
      await this.tx
        .update(outcomes)
        .set({ position: update.position + 100 })
        .where(and(eq(outcomes.id, update.id), eq(outcomes.goalId, goalId)));
    }

    // Phase 2: Set final positions
    for (const update of updates) {
      await this.tx
        .update(outcomes)
        .set({ position: update.position })
        .where(and(eq(outcomes.id, update.id), eq(outcomes.goalId, goalId)));
    }
  }

  private mapToDomain(row: typeof outcomes.$inferSelect): Outcome {
    const hasMeasure = row.measureTarget !== null && row.measureCurrent !== null;
    return {
      id: row.id,
      goalId: row.goalId,
      title: row.title,
      description: row.description,
      measure: hasMeasure
        ? {
            target: Number(row.measureTarget),
            current: Number(row.measureCurrent),
            unit: row.measureUnit!,
          }
        : null,
      position: row.position,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
