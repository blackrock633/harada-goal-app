import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDeps } from './create-test-deps';
import { Database } from '../db/client';
import { Deps, UniqueViolationError } from '@/application/ports';
import { users, goals } from '../db/schema';
import { eq } from 'drizzle-orm';

describe('Database Infrastructure', () => {
  let deps: Deps;
  let db: Database;
  let close: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestDeps({ fastHashing: true });
    deps = setup.deps;
    db = setup.db;
    close = setup.close;
  });

  afterEach(async () => {
    await close();
  });

  it('enforces partial unique index on outcomes (position and goal_id)', async () => {
    const userId = deps.ids();
    await deps.uow.run(async (repos) => {
      await repos.users.insert({
        id: userId,
        email: 'test@example.com',
        displayName: 'Test',
        timeZone: 'UTC',
        createdAt: new Date(),
        updatedAt: new Date(),
      }, 'hash');

      const goal = {
        id: deps.ids(),
        ownerId: userId,
        title: 'Goal',
        vision: '',
        targetDate: null,
        status: 'draft' as const,
        statusBeforeArchive: null,
        purpose: {
          selfTangible: '',
          selfIntangible: '',
          othersTangible: '',
          othersIntangible: '',
        },
        activatedOn: null,
        achievedAt: null,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await repos.goals.insert(goal);

      const outcome1 = {
        id: deps.ids(),
        goalId: goal.id,
        title: 'O1',
        description: '',
        measure: null,
        position: 0,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await repos.outcomes.insert(outcome1);

      const outcome2 = {
        id: deps.ids(),
        goalId: goal.id,
        title: 'O2',
        description: '',
        measure: null,
        position: 0, // Duplicate position
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await expect(repos.outcomes.insert(outcome2)).rejects.toThrow();
    });
  });

  it('respects UoW rollback', async () => {
    const userId = deps.ids();
    
    await expect(deps.uow.run(async (repos) => {
      await repos.users.insert({
        id: userId,
        email: 'test@example.com',
        displayName: 'Test',
        timeZone: 'UTC',
        createdAt: new Date(),
        updatedAt: new Date(),
      }, 'hash');
      
      throw new Error('Rollback');
    })).rejects.toThrow('Rollback');

    await deps.uow.run(async (repos) => {
      const user = await repos.users.findById(userId);
      expect(user).toBeNull(); // Should be rolled back
    });
  });
});
