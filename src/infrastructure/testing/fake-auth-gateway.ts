import crypto from 'crypto';
import type { PGlite } from '@electric-sql/pglite';
import { AuthGateway, AuthGatewayError, AuthUser } from '@/application/ports';
import type { Id } from '@/domain/types';

/**
 * TEST DOUBLE for Supabase Auth. Not a security implementation: passwords are kept in memory in
 * plain text. It writes real rows to the emulated auth.users table so the profile trigger, FKs and
 * cascades behave as on Supabase. Tests can simulate an expired session with `expireSession()` and an
 * outage with `failNextWith('UNAVAILABLE')`.
 */
export class FakeAuthGateway implements AuthGateway {
  private readonly accounts = new Map<string, { id: Id; password: string }>();
  private current: AuthUser | null = null;
  private pendingFailure: AuthGatewayError | null = null;
  /** Mirrors Supabase's "Confirm email" project setting. */
  requireEmailConfirmation = false;

  constructor(private readonly client: PGlite) {}

  failNextWith(reason: AuthGatewayError['reason']): void {
    this.pendingFailure = new AuthGatewayError(reason);
  }

  expireSession(): void {
    this.current = null;
  }

  /** Test helper: act as an existing user without going through signIn. */
  actAs(user: AuthUser | null): void {
    this.current = user;
  }

  private throwPending(): void {
    const f = this.pendingFailure;
    this.pendingFailure = null;
    if (f) throw f;
  }

  async signUp(input: { email: string; password: string; displayName: string; timeZone: string }) {
    this.throwPending();
    const email = input.email.trim().toLowerCase();
    if (this.accounts.has(email)) throw new AuthGatewayError('EMAIL_TAKEN');
    if (input.password.length < 8) throw new AuthGatewayError('WEAK_PASSWORD');
    const id = crypto.randomUUID();
    await this.client.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
      id,
      email,
      JSON.stringify({ display_name: input.displayName, time_zone: input.timeZone }),
    ]);
    this.accounts.set(email, { id, password: input.password });
    const user = { id, email };
    const confirmed = !this.requireEmailConfirmation;
    if (confirmed) this.current = user;
    return { user, confirmed };
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    this.throwPending();
    const key = email.trim().toLowerCase();
    const acct = this.accounts.get(key);
    if (!acct || acct.password !== password) throw new AuthGatewayError('INVALID_CREDENTIALS');
    this.current = { id: acct.id, email: key };
    return this.current;
  }

  async signOut(): Promise<void> {
    this.throwPending();
    this.current = null;
  }

  async getUser(): Promise<AuthUser | null> {
    this.throwPending();
    return this.current;
  }

  async verifyPassword(email: string, password: string): Promise<boolean> {
    this.throwPending();
    return this.accounts.get(email.trim().toLowerCase())?.password === password;
  }

  async updatePassword(newPassword: string): Promise<void> {
    this.throwPending();
    if (!this.current) throw new AuthGatewayError('INVALID_CREDENTIALS');
    if (newPassword.length < 8) throw new AuthGatewayError('WEAK_PASSWORD');
    this.accounts.get(this.current.email)!.password = newPassword;
  }

  async deleteUser(userId: Id): Promise<void> {
    this.throwPending();
    await this.client.query('delete from auth.users where id = $1', [userId]);
    for (const [email, acct] of this.accounts) if (acct.id === userId) this.accounts.delete(email);
    if (this.current?.id === userId) this.current = null;
  }
}
