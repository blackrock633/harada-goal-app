import { UnitOfWork, Repos } from '@/application/ports';
import { Database } from './client';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { UserRepoImpl } from './repositories/user-repo';
import { SessionRepoImpl } from './repositories/session-repo';
import { GoalRepoImpl } from './repositories/goal-repo';
import { OutcomeRepoImpl } from './repositories/outcome-repo';
import { ActionRepoImpl } from './repositories/action-repo';
import { RoutineCheckRepoImpl } from './repositories/routine-check-repo';
import { ReflectionRepoImpl } from './repositories/reflection-repo';
import { GoalEventRepoImpl } from './repositories/goal-event-repo';

export function createUnitOfWork(db: Database): UnitOfWork {
  return {
    async run<T>(fn: (repos: Repos) => Promise<T>): Promise<T> {
      return db.transaction(async (tx) => {
        const repos: Repos = {
          users: new UserRepoImpl(tx),
          sessions: new SessionRepoImpl(tx),
          goals: new GoalRepoImpl(tx),
          outcomes: new OutcomeRepoImpl(tx),
          actions: new ActionRepoImpl(tx),
          checks: new RoutineCheckRepoImpl(tx),
          reflections: new ReflectionRepoImpl(tx),
          events: new GoalEventRepoImpl(tx),
        };
        return fn(repos);
      });
    },
  };
}
