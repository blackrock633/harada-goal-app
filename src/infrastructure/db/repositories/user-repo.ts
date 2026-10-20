/* eslint-disable @typescript-eslint/no-explicit-any */
import { UserRepo, UniqueViolationError } from '@/application/ports';
import { User, Id, Instant } from '@/domain/types';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { users } from '../schema';
import { eq } from 'drizzle-orm';

export class UserRepoImpl implements UserRepo {
  constructor(private readonly tx: PgTransaction<any, any, any>) {}

  async findById(id: Id): Promise<User | null> {
    const rows = await this.tx.select().from(users).where(eq(users.id, id));
    if (rows.length === 0) return null;
    return this.mapToDomain(rows[0]!);
  }

  async findByEmailWithHash(email: string): Promise<{ user: User; passwordHash: string } | null> {
    const rows = await this.tx.select().from(users).where(eq(users.email, email));
    if (rows.length === 0) return null;
    return {
      user: this.mapToDomain(rows[0]!),
      passwordHash: rows[0]!.passwordHash,
    };
  }

  async insert(user: User, passwordHash: string): Promise<void> {
    try {
      await this.tx.insert(users).values({
        id: user.id,
        email: user.email,
        passwordHash,
        displayName: user.displayName,
        timeZone: user.timeZone,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (e: any) {
      if (e.code === '23505' || e.message?.includes('users_email_unique')) {
        throw new UniqueViolationError('users_email_unique');
      }
      throw e;
    }
  }

  async update(id: Id, patch: { displayName?: string; timeZone?: string; updatedAt: Instant }): Promise<User> {
    const rows = await this.tx
      .update(users)
      .set({
        ...(patch.displayName !== undefined && { displayName: patch.displayName }),
        ...(patch.timeZone !== undefined && { timeZone: patch.timeZone }),
        updatedAt: patch.updatedAt,
      })
      .where(eq(users.id, id))
      .returning();

    if (rows.length === 0) throw new Error('User not found');
    return this.mapToDomain(rows[0]!);
  }

  async getPasswordHash(id: Id): Promise<string | null> {
    const rows = await this.tx.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, id));
    if (rows.length === 0) return null;
    return rows[0]!.passwordHash;
  }

  async updatePasswordHash(id: Id, passwordHash: string, updatedAt: Instant): Promise<void> {
    await this.tx
      .update(users)
      .set({ passwordHash, updatedAt })
      .where(eq(users.id, id));
  }

  async delete(id: Id): Promise<void> {
    await this.tx.delete(users).where(eq(users.id, id));
  }

  private mapToDomain(row: typeof users.$inferSelect): User {
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      timeZone: row.timeZone,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
