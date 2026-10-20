/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotOwnedError, Profile, ProfileRepo } from '@/application/ports';
import { Id, Instant } from '@/domain/types';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { profiles } from '../schema';
import { eq } from 'drizzle-orm';

export class ProfileRepoImpl implements ProfileRepo {
  constructor(private readonly tx: PgTransaction<any, any, any>) {}

  async findById(id: Id): Promise<Profile | null> {
    const rows = await this.tx.select().from(profiles).where(eq(profiles.id, id));
    return rows[0] ? this.mapToDomain(rows[0]) : null;
  }

  async update(id: Id, patch: { displayName?: string; timeZone?: string; updatedAt: Instant }): Promise<Profile> {
    const set: Partial<typeof profiles.$inferInsert> = { updatedAt: patch.updatedAt };
    if (patch.displayName !== undefined) set.displayName = patch.displayName;
    if (patch.timeZone !== undefined) set.timeZone = patch.timeZone;
    const rows = await this.tx.update(profiles).set(set).where(eq(profiles.id, id)).returning();
    // RLS hides other users' rows, so zero rows means the profile isn't accessible to this user.
    if (!rows[0]) throw new NotOwnedError('profiles');
    return this.mapToDomain(rows[0]);
  }

  private mapToDomain(row: typeof profiles.$inferSelect): Profile {
    return {
      id: row.id,
      displayName: row.displayName,
      timeZone: row.timeZone,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
