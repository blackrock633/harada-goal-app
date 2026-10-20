/* eslint-disable @typescript-eslint/no-explicit-any */
import { GoalRepo } from '@/application/ports';
import { Goal, GoalStatus, Id } from '@/domain/types';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { goals } from '../schema';
import { eq, and, inArray } from 'drizzle-orm';

export class GoalRepoImpl implements GoalRepo {
  constructor(private readonly tx: PgTransaction<any, any, any>) {}

  async findById(ownerId: Id, goalId: Id): Promise<Goal | null> {
    const rows = await this.tx.select().from(goals).where(and(eq(goals.id, goalId), eq(goals.ownerId, ownerId)));
    if (rows.length === 0) return null;
    return this.mapToDomain(rows[0]!);
  }

  async lock(ownerId: Id, goalId: Id): Promise<Goal | null> {
    const rows = await this.tx
      .select()
      .from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.ownerId, ownerId)))
      .for('update');
    if (rows.length === 0) return null;
    return this.mapToDomain(rows[0]!);
  }

  async listByOwner(ownerId: Id, statuses?: GoalStatus[]): Promise<Goal[]> {
    let query = this.tx.select().from(goals).where(eq(goals.ownerId, ownerId));
    if (statuses && statuses.length > 0) {
      query = this.tx.select().from(goals).where(and(eq(goals.ownerId, ownerId), inArray(goals.status, statuses)));
    }
    const rows = await query;
    return rows.map(this.mapToDomain);
  }

  async insert(goal: Goal): Promise<void> {
    await this.tx.insert(goals).values({
      id: goal.id,
      ownerId: goal.ownerId,
      title: goal.title,
      vision: goal.vision,
      targetDate: goal.targetDate,
      status: goal.status,
      statusBeforeArchive: goal.statusBeforeArchive,
      purposeSelfTangible: goal.purpose.selfTangible,
      purposeSelfIntangible: goal.purpose.selfIntangible,
      purposeOthersTangible: goal.purpose.othersTangible,
      purposeOthersIntangible: goal.purpose.othersIntangible,
      activatedOn: goal.activatedOn,
      achievedAt: goal.achievedAt,
      archivedAt: goal.archivedAt,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
    });
  }

  async update(goal: Goal): Promise<void> {
    await this.tx
      .update(goals)
      .set({
        title: goal.title,
        vision: goal.vision,
        targetDate: goal.targetDate,
        status: goal.status,
        statusBeforeArchive: goal.statusBeforeArchive,
        purposeSelfTangible: goal.purpose.selfTangible,
        purposeSelfIntangible: goal.purpose.selfIntangible,
        purposeOthersTangible: goal.purpose.othersTangible,
        purposeOthersIntangible: goal.purpose.othersIntangible,
        activatedOn: goal.activatedOn,
        achievedAt: goal.achievedAt,
        archivedAt: goal.archivedAt,
        updatedAt: goal.updatedAt,
      })
      .where(and(eq(goals.id, goal.id), eq(goals.ownerId, goal.ownerId)));
  }

  async deleteById(ownerId: Id, goalId: Id): Promise<void> {
    await this.tx.delete(goals).where(and(eq(goals.id, goalId), eq(goals.ownerId, ownerId)));
  }

  private mapToDomain(row: typeof goals.$inferSelect): Goal {
    return {
      id: row.id,
      ownerId: row.ownerId,
      title: row.title,
      vision: row.vision,
      targetDate: row.targetDate,
      status: row.status as GoalStatus,
      statusBeforeArchive: row.statusBeforeArchive as any,
      purpose: {
        selfTangible: row.purposeSelfTangible,
        selfIntangible: row.purposeSelfIntangible,
        othersTangible: row.purposeOthersTangible,
        othersIntangible: row.purposeOthersIntangible,
      },
      activatedOn: row.activatedOn,
      achievedAt: row.achievedAt,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
