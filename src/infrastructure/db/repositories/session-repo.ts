/* eslint-disable @typescript-eslint/no-explicit-any */
import { SessionRepo, SessionRecord } from '@/application/ports';
import { User, Id, Instant } from '@/domain/types';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { sessions, users } from '../schema';
import { eq, gt, lt, ne, and } from 'drizzle-orm';

export class SessionRepoImpl implements SessionRepo {
  constructor(private readonly tx: PgTransaction<any, any, any>) {}

  async insert(session: SessionRecord): Promise<void> {
    await this.tx.insert(sessions).values({
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    });
  }

  async findValid(id: string, now: Instant): Promise<{ session: SessionRecord; user: User } | null> {
    const rows = await this.tx
      .select()
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)));

    if (rows.length === 0) return null;

    const row = rows[0]!;
    return {
      session: {
        id: row.sessions.id,
        userId: row.sessions.userId,
        expiresAt: row.sessions.expiresAt,
        createdAt: row.sessions.createdAt,
      },
      user: {
        id: row.users.id,
        email: row.users.email,
        displayName: row.users.displayName,
        timeZone: row.users.timeZone,
        createdAt: row.users.createdAt,
        updatedAt: row.users.updatedAt,
      },
    };
  }

  async extend(id: string, expiresAt: Instant): Promise<void> {
    await this.tx.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.tx.delete(sessions).where(eq(sessions.id, id));
  }

  async deleteAllForUser(userId: Id, exceptId?: string): Promise<void> {
    if (exceptId) {
      await this.tx.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, exceptId)));
    } else {
      await this.tx.delete(sessions).where(eq(sessions.userId, userId));
    }
  }

  async deleteExpired(now: Instant): Promise<number> {
    const rows = await this.tx.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
    return rows.length;
  }
}
