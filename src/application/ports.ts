/**
 * Ports: the contract between the application layer and infrastructure.
 * CONTRACT FILE — change only via the protocol in docs/ARCHITECTURE.md §7.
 *
 * Ownership rules:
 *  - Methods taking `ownerId` MUST return null / do nothing when the row isn't owned by that user.
 *  - Methods taking only a `goalId`/`outcomeId` are called ONLY after the use case has loaded the parent
 *    goal scoped by owner inside the same unit of work.
 */
import type {
  Action,
  Goal,
  GoalEvent,
  GoalStatus,
  Id,
  Instant,
  LocalDate,
  Outcome,
  Reflection,
  RoutineCheck,
  User,
} from '@/domain/types';

export interface UserRepo {
  findById(id: Id): Promise<User | null>;
  /** `email` must already be normalised (trimmed, lowercased). */
  findByEmailWithHash(email: string): Promise<{ user: User; passwordHash: string } | null>;
  /** Throws UniqueViolationError if the email exists. */
  insert(user: User, passwordHash: string): Promise<void>;
  update(id: Id, patch: { displayName?: string; timeZone?: string; updatedAt: Instant }): Promise<User>;
  getPasswordHash(id: Id): Promise<string | null>;
  updatePasswordHash(id: Id, passwordHash: string, updatedAt: Instant): Promise<void>;
  /** Hard delete; cascades to all owned data. */
  delete(id: Id): Promise<void>;
}

export interface SessionRecord {
  id: string; // SHA-256 hex of the token
  userId: Id;
  expiresAt: Instant;
  createdAt: Instant;
}

export interface SessionRepo {
  insert(session: SessionRecord): Promise<void>;
  /** Returns the session and user if the session exists and expiresAt > now. */
  findValid(id: string, now: Instant): Promise<{ session: SessionRecord; user: User } | null>;
  extend(id: string, expiresAt: Instant): Promise<void>;
  delete(id: string): Promise<void>;
  deleteAllForUser(userId: Id, exceptId?: string): Promise<void>;
  deleteExpired(now: Instant): Promise<number>;
}

export interface GoalRepo {
  findById(ownerId: Id, goalId: Id): Promise<Goal | null>;
  /** Same as findById but takes a row lock (SELECT … FOR UPDATE) to serialise structural edits. */
  lock(ownerId: Id, goalId: Id): Promise<Goal | null>;
  listByOwner(ownerId: Id, statuses?: GoalStatus[]): Promise<Goal[]>;
  insert(goal: Goal): Promise<void>;
  /** Writes all mutable fields of the goal (matched by id AND ownerId). */
  update(goal: Goal): Promise<void>;
  deleteById(ownerId: Id, goalId: Id): Promise<void>;
}

export interface PositionUpdate {
  id: Id;
  position: number;
}

export interface OutcomeRepo {
  findById(ownerId: Id, outcomeId: Id): Promise<Outcome | null>;
  /** All outcomes (active and archived) for these goals, ordered by position (nulls last) then createdAt. */
  listByGoals(goalIds: Id[]): Promise<Outcome[]>;
  insert(outcome: Outcome): Promise<void>;
  /** Writes all mutable fields INCLUDING position/archivedAt. */
  update(outcome: Outcome): Promise<void>;
  /** Atomically rewrites positions of ACTIVE outcomes in a goal (two-phase to respect the partial unique index). */
  setPositions(goalId: Id, updates: PositionUpdate[]): Promise<void>;
}

export interface ActionPositionUpdate {
  id: Id;
  outcomeId: Id;
  position: number;
}

export interface ActionRepo {
  findById(ownerId: Id, actionId: Id): Promise<Action | null>;
  /** All actions (active and archived) for these goals, ordered by outcome, position (nulls last), createdAt. */
  listByGoals(goalIds: Id[]): Promise<Action[]>;
  insert(action: Action): Promise<void>;
  /** Writes all mutable fields INCLUDING outcomeId/position/archivedAt. */
  update(action: Action): Promise<void>;
  /** Atomically rewrites outcomeId+position for ACTIVE actions within ONE goal (two-phase). */
  setPositions(goalId: Id, updates: ActionPositionUpdate[]): Promise<void>;
}

export interface RoutineCheckRepo {
  /** Checks for the given actions with from <= date <= to (inclusive), ordered by date. */
  listForActions(actionIds: Id[], from: LocalDate, to: LocalDate): Promise<RoutineCheck[]>;
  /** Idempotent (ON CONFLICT DO NOTHING). */
  add(check: RoutineCheck): Promise<void>;
  /** Idempotent. */
  remove(actionId: Id, date: LocalDate): Promise<void>;
}

export interface ReflectionRepo {
  findById(ownerId: Id, reflectionId: Id): Promise<Reflection | null>;
  /** Newest first (date desc, createdAt desc). `before` is exclusive. */
  listByGoal(goalId: Id, opts: { limit: number; before?: LocalDate }): Promise<Reflection[]>;
  /** Most recent reflection date per goal (for "last reflected" hints). */
  latestDateByGoals(goalIds: Id[]): Promise<Record<Id, LocalDate>>;
  insert(reflection: Reflection): Promise<void>;
  update(reflection: Reflection): Promise<void>;
  deleteById(reflectionId: Id): Promise<void>;
}

export interface GoalEventRepo {
  append(event: GoalEvent): Promise<void>;
  /** Newest first. `before` is exclusive. */
  listByGoal(goalId: Id, opts: { limit: number; before?: Instant }): Promise<GoalEvent[]>;
}

export interface Repos {
  users: UserRepo;
  sessions: SessionRepo;
  goals: GoalRepo;
  outcomes: OutcomeRepo;
  actions: ActionRepo;
  checks: RoutineCheckRepo;
  reflections: ReflectionRepo;
  events: GoalEventRepo;
}

export interface UnitOfWork {
  /** Runs `fn` inside a single database transaction. Rolls back if `fn` throws. */
  run<T>(fn: (repos: Repos) => Promise<T>): Promise<T>;
}

/** Thrown by repositories when a unique constraint is violated (mapped to CONFLICT). */
export class UniqueViolationError extends Error {
  constructor(public readonly constraint: string) {
    super(`Unique constraint violated: ${constraint}`);
    this.name = 'UniqueViolationError';
  }
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface SessionTokens {
  /** Cryptographically random, URL-safe token (>= 160 bits). */
  generate(): string;
  /** SHA-256 hex of a token. */
  hash(token: string): string;
}

export interface RateLimiter {
  /** Returns true if allowed; false if `key` exceeded `limit` within `windowMs`. */
  consume(key: string, limit: number, windowMs: number): boolean;
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface Deps {
  uow: UnitOfWork;
  ids: () => Id;
  passwords: PasswordHasher;
  tokens: SessionTokens;
  rateLimiter: RateLimiter;
  logger: Logger;
}
