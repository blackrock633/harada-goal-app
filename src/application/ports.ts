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
  DailyFocus,
  Goal,
  GoalEvent,
  GoalStatus,
  Id,
  Instant,
  LocalDate,
  Outcome,
  Reflection,
  RoutineCheck,
} from '@/domain/types';

/** App-level profile. Credentials and email live in Supabase Auth (auth.users), not here. */
export interface Profile {
  id: Id;
  displayName: string;
  timeZone: string;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface ProfileRepo {
  /** The profile row is created by the `on_auth_user_created` DB trigger, never by the app. */
  findById(id: Id): Promise<Profile | null>;
  update(id: Id, patch: { displayName?: string; timeZone?: string; updatedAt: Instant }): Promise<Profile>;
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
  /** Atomically rewrites positions of ACTIVE outcomes in a goal (exclusion constraint deferred for the swap). */
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
  /** Atomically rewrites outcomeId+position for ACTIVE actions within ONE goal (exclusion constraint deferred). */
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

export interface DailyFocusRepo {
  /** The owner's focus for one date, ordered by slot. */
  listForDate(ownerId: Id, date: LocalDate): Promise<DailyFocus[]>;
  /** Inserts the row; returns false (no-op) if that action is already focused on that date. */
  add(focus: DailyFocus): Promise<boolean>;
  /** Idempotent. */
  remove(ownerId: Id, actionId: Id, date: LocalDate): Promise<void>;
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
  profiles: ProfileRepo;
  goals: GoalRepo;
  outcomes: OutcomeRepo;
  actions: ActionRepo;
  checks: RoutineCheckRepo;
  focus: DailyFocusRepo;
  reflections: ReflectionRepo;
  events: GoalEventRepo;
}

export interface UnitOfWork {
  /**
   * Runs `fn` inside a single database transaction AS `userId`: the transaction switches to the
   * Postgres `authenticated` role with JWT claims `{ sub: userId }`, so row-level security applies to
   * every query. `userId` MUST come from a verified Supabase Auth session (AuthGateway.getUser), never
   * from client input. Rolls back if `fn` throws.
   */
  run<T>(userId: Id, fn: (repos: Repos) => Promise<T>): Promise<T>;
}

/**
 * Thrown by repositories when a unique or exclusion constraint is violated (SQLSTATE 23505 / 23P01),
 * e.g. a concurrent add took the same position, or an idempotent create was replayed. Mapped to CONFLICT.
 */
export class UniqueViolationError extends Error {
  constructor(public readonly constraint: string) {
    super(`Unique constraint violated: ${constraint}`);
    this.name = 'UniqueViolationError';
  }
}

/**
 * Thrown by repositories when RLS rejects a write (SQLSTATE 42501) or a foreign key points at a row
 * that doesn't exist / isn't in the same goal (23503). Mapped to NOT_FOUND so existence isn't leaked.
 */
export class NotOwnedError extends Error {
  constructor(public readonly detail: string) {
    super(`Row not accessible: ${detail}`);
    this.name = 'NotOwnedError';
  }
}

/** Thrown when the database can't be reached (connection refused/reset/timeout). Mapped to UNAVAILABLE. */
export class DatabaseUnavailableError extends Error {
  constructor(public readonly detail: string) {
    super(`Database unavailable: ${detail}`);
    this.name = 'DatabaseUnavailableError';
  }
}

export interface AuthUser {
  id: Id;
  email: string;
}

export type AuthFailureReason =
  | 'INVALID_CREDENTIALS' // wrong email/password (never says which)
  | 'EMAIL_TAKEN'
  | 'WEAK_PASSWORD'
  | 'EMAIL_NOT_CONFIRMED'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'; // network failure / Supabase unreachable

/** Expected auth failures. Anything else thrown by a gateway is unexpected (→ INTERNAL). */
export class AuthGatewayError extends Error {
  constructor(public readonly reason: AuthFailureReason, message?: string) {
    super(message ?? reason);
    this.name = 'AuthGatewayError';
  }
}

/**
 * Supabase Auth, bound to the current request's cookies (server-side only).
 * Implementations throw AuthGatewayError for expected failures.
 */
export interface AuthGateway {
  /** `confirmed: false` when the project requires email confirmation (no session yet). */
  /** `referralCode` (validated, 10 hex chars) is stored in sign-up metadata for referral attribution. */
  signUp(input: { email: string; password: string; displayName: string; timeZone: string; referralCode?: string }): Promise<{
    user: AuthUser;
    confirmed: boolean;
  }>;
  signIn(email: string, password: string): Promise<AuthUser>;
  /** Clears this device's session. Idempotent. */
  signOut(): Promise<void>;
  /** Verified with Supabase Auth (not merely a decoded cookie). null when there is no valid session. */
  getUser(): Promise<AuthUser | null>;
  /** Re-authentication check for sensitive operations. */
  verifyPassword(email: string, password: string): Promise<boolean>;
  /** Updates the current user's password and signs out their other sessions. */
  updatePassword(newPassword: string): Promise<void>;
  /** Server-only (service role). Cascades to all of the user's data via FKs. */
  deleteUser(userId: Id): Promise<void>;
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
  auth: AuthGateway;
  rateLimiter: RateLimiter;
  logger: Logger;
}
