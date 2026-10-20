/* eslint-disable @typescript-eslint/no-explicit-any */
import { ActionRepo, ActionPositionUpdate } from '@/application/ports';
import { Action, Id, Schedule } from '@/domain/types';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { actions, goals } from '../schema';
import { eq, and, inArray, asc } from 'drizzle-orm';

export class ActionRepoImpl implements ActionRepo {
  constructor(private readonly tx: PgTransaction<any, any, any>) {}

  async findById(ownerId: Id, actionId: Id): Promise<Action | null> {
    const rows = await this.tx
      .select({ action: actions })
      .from(actions)
      .innerJoin(goals, eq(actions.goalId, goals.id))
      .where(and(eq(actions.id, actionId), eq(goals.ownerId, ownerId)));

    if (rows.length === 0) return null;
    return this.mapToDomain(rows[0]!.action);
  }

  async listByGoals(goalIds: Id[]): Promise<Action[]> {
    if (goalIds.length === 0) return [];

    const rows = await this.tx
      .select()
      .from(actions)
      .where(inArray(actions.goalId, goalIds))
      .orderBy(asc(actions.outcomeId), asc(actions.position), asc(actions.createdAt));

    return rows.map(this.mapToDomain);
  }

  async insert(action: Action): Promise<void> {
    const isRoutine = action.kind === 'routine';
    const sched = action.schedule;

    await this.tx.insert(actions).values({
      id: action.id,
      goalId: action.goalId,
      outcomeId: action.outcomeId,
      title: action.title,
      notes: action.notes,
      kind: action.kind,
      position: action.position,
      dueDate: !isRoutine ? action.dueDate : null,
      completedAt: !isRoutine ? action.completedAt : null,
      scheduleType: sched ? sched.type : null,
      scheduleDays: sched?.type === 'weekdays' ? (sched as any).days : null,
      scheduleTimesPerWeek: sched?.type === 'weekly' ? (sched as any).timesPerWeek : null,
      startDate: isRoutine ? action.startDate : null,
      archivedAt: action.archivedAt,
      createdAt: action.createdAt,
      updatedAt: action.updatedAt,
    });
  }

  async update(action: Action): Promise<void> {
    const isRoutine = action.kind === 'routine';
    const sched = action.schedule;

    await this.tx
      .update(actions)
      .set({
        outcomeId: action.outcomeId,
        title: action.title,
        notes: action.notes,
        position: action.position,
        dueDate: !isRoutine ? action.dueDate : null,
        completedAt: !isRoutine ? action.completedAt : null,
        scheduleType: sched ? sched.type : null,
        scheduleDays: sched?.type === 'weekdays' ? (sched as any).days : null,
        scheduleTimesPerWeek: sched?.type === 'weekly' ? (sched as any).timesPerWeek : null,
        startDate: isRoutine ? action.startDate : null,
        archivedAt: action.archivedAt,
        updatedAt: action.updatedAt,
      })
      .where(eq(actions.id, action.id));
  }

  async setPositions(goalId: Id, updates: ActionPositionUpdate[]): Promise<void> {
    if (updates.length === 0) return;

    // Phase 1: Bump position + 100 for all updated rows
    for (const update of updates) {
      await this.tx
        .update(actions)
        .set({ position: update.position + 100 })
        .where(and(eq(actions.id, update.id), eq(actions.goalId, goalId)));
    }

    // Phase 2: Set final outcomeId and position
    for (const update of updates) {
      await this.tx
        .update(actions)
        .set({ outcomeId: update.outcomeId, position: update.position })
        .where(and(eq(actions.id, update.id), eq(actions.goalId, goalId)));
    }
  }

  private mapToDomain(row: typeof actions.$inferSelect): Action {
    let schedule: Schedule | null = null;
    if (row.scheduleType === 'daily') {
      schedule = { type: 'daily' };
    } else if (row.scheduleType === 'weekdays') {
      schedule = { type: 'weekdays', days: row.scheduleDays as number[] as any };
    } else if (row.scheduleType === 'weekly') {
      schedule = { type: 'weekly', timesPerWeek: row.scheduleTimesPerWeek! };
    }

    return {
      id: row.id,
      goalId: row.goalId,
      outcomeId: row.outcomeId,
      title: row.title,
      notes: row.notes,
      kind: row.kind as any,
      position: row.position,
      dueDate: row.dueDate,
      completedAt: row.completedAt,
      schedule,
      startDate: row.startDate,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
