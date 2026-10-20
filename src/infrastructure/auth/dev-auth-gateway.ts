import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { sql } from 'drizzle-orm';
import { AuthGateway, AuthGatewayError, AuthUser } from '@/application/ports';
import type { Id } from '@/domain/types';
import type { Database } from '../db/client';
import { DEV_AUTH_COOKIE, isDevAuthEnabled } from './mode';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * LOCAL DEVELOPMENT ONLY. Stands in for Supabase Auth when no Supabase project is available
 * (AUTH_PROVIDER=dev). Accounts live in the local PGlite auth.users table (so the real profile trigger
 * fires); password hashes live in a dev-only `dev_auth` schema created lazily, never in migrations.
 * The session cookie is `<userId>.<HMAC>` signed with DEV_AUTH_SECRET. Refuses to construct in production.
 */
export class DevAuthGateway implements AuthGateway {
  private readonly secret: string;
  private ready: Promise<void> | null = null;

  constructor(private readonly db: Database) {
    if (!isDevAuthEnabled()) {
      throw new Error('DevAuthGateway requires AUTH_PROVIDER=dev and NODE_ENV !== production');
    }
    const secret = process.env.DEV_AUTH_SECRET;
    if (!secret || secret.length < 16) throw new Error('DEV_AUTH_SECRET (min 16 chars) is required for dev auth');
    this.secret = secret;
  }

  private async rows<T>(q: ReturnType<typeof sql>): Promise<T[]> {
    const r = (await this.db.execute(q)) as unknown as T[] | { rows: T[] };
    return Array.isArray(r) ? r : r.rows;
  }

  private init(): Promise<void> {
    this.ready ??= (async () => {
      await this.db.execute(sql`create schema if not exists dev_auth`);
      await this.db.execute(
        sql`create table if not exists dev_auth.credentials (
          user_id uuid primary key references auth.users (id) on delete cascade,
          password_hash text not null)`,
      );
    })();
    return this.ready;
  }

  private sign(id: string): string {
    return crypto.createHmac('sha256', this.secret).update(id).digest('base64url');
  }

  private async hash(password: string): Promise<string> {
    const salt = crypto.randomBytes(16);
    return `${salt.toString('hex')}:${(await scrypt(password, salt, 32)).toString('hex')}`;
  }

  private async check(password: string, stored: string): Promise<boolean> {
    const [saltHex, hashHex] = stored.split(':');
    const expected = Buffer.from(hashHex ?? '', 'hex');
    const actual = await scrypt(password, Buffer.from(saltHex ?? '', 'hex'), 32);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  private async setSession(id: string): Promise<void> {
    (await cookies()).set(DEV_AUTH_COOKIE, `${id}.${this.sign(id)}`, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
    });
  }

  private async findByEmail(email: string) {
    const rows = await this.rows<{ id: string; email: string; password_hash: string | null }>(
      sql`select u.id, u.email, c.password_hash from auth.users u
          left join dev_auth.credentials c on c.user_id = u.id
          where lower(u.email) = ${email.trim().toLowerCase()} limit 1`,
    );
    return rows[0] ?? null;
  }

  async signUp(input: { email: string; password: string; displayName: string; timeZone: string }) {
    await this.init();
    const email = input.email.trim().toLowerCase();
    if (input.password.length < 8) throw new AuthGatewayError('WEAK_PASSWORD');
    if (await this.findByEmail(email)) throw new AuthGatewayError('EMAIL_TAKEN');
    const id = crypto.randomUUID();
    const meta = JSON.stringify({ display_name: input.displayName, time_zone: input.timeZone });
    const hash = await this.hash(input.password);
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${email}, ${meta}::jsonb)`);
      await tx.execute(sql`insert into dev_auth.credentials (user_id, password_hash) values (${id}, ${hash})`);
    });
    await this.setSession(id);
    return { user: { id, email }, confirmed: true };
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    await this.init();
    const row = await this.findByEmail(email);
    // Hash even when the account is missing so timing doesn't reveal which emails exist.
    const ok = await this.check(password, row?.password_hash ?? `00:${'00'.repeat(32)}`);
    if (!row || !ok) throw new AuthGatewayError('INVALID_CREDENTIALS');
    await this.setSession(row.id);
    return { id: row.id, email: row.email };
  }

  async signOut(): Promise<void> {
    (await cookies()).delete(DEV_AUTH_COOKIE);
  }

  async getUser(): Promise<AuthUser | null> {
    const raw = (await cookies()).get(DEV_AUTH_COOKIE)?.value;
    if (!raw) return null;
    const dot = raw.lastIndexOf('.');
    const id = raw.slice(0, dot);
    const mac = Buffer.from(raw.slice(dot + 1));
    const want = Buffer.from(this.sign(id));
    if (dot < 0 || !UUID_RE.test(id) || mac.length !== want.length || !crypto.timingSafeEqual(mac, want)) return null;
    const rows = await this.rows<{ id: string; email: string }>(sql`select id, email from auth.users where id = ${id}`);
    return rows[0] ? { id: rows[0].id, email: rows[0].email } : null;
  }

  async verifyPassword(email: string, password: string): Promise<boolean> {
    await this.init();
    const row = await this.findByEmail(email);
    return !!row?.password_hash && (await this.check(password, row.password_hash));
  }

  async updatePassword(newPassword: string): Promise<void> {
    await this.init();
    const user = await this.getUser();
    if (!user) throw new AuthGatewayError('INVALID_CREDENTIALS');
    if (newPassword.length < 8) throw new AuthGatewayError('WEAK_PASSWORD');
    const hash = await this.hash(newPassword);
    await this.db.execute(sql`update dev_auth.credentials set password_hash = ${hash} where user_id = ${user.id}`);
  }

  async deleteUser(userId: Id): Promise<void> {
    await this.init();
    await this.db.execute(sql`delete from auth.users where id = ${userId}`);
    await this.signOut();
  }
}
