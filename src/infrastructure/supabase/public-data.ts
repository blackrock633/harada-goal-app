import 'server-only';
import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isShareToken,
  parseAdminMetrics,
  parseMyPlan,
  parsePricingCatalog,
  parseSharedCard,
  type AdminMetricsDTO,
  type MyPlanDTO,
  type PricingCatalogDTO,
  type SharedCardViewDTO,
} from '@/application/web-public';
import { ConsoleLogger } from '../logger';

/**
 * Reads behind the public pages and the billing/admin pages. Each takes the Supabase client to use (anon or
 * user-bound, see ./server) and never throws: failures are logged without payloads and return null, so pages
 * render an honest "unavailable" state instead of an error.
 */
const logger = new ConsoleLogger();

function warn(what: string, e: unknown) {
  const code = (e as { code?: unknown })?.code;
  logger.warn(`${what} failed`, { code: typeof code === 'string' ? code : undefined });
}

/** The Free/Pro catalogue from `plans`, `plan_features` and `prices` (active only), read at request time. */
export async function fetchPricingCatalog(client: SupabaseClient | null): Promise<PricingCatalogDTO | null> {
  if (!client) return null;
  try {
    const [plans, features, prices] = await Promise.all([
      client.from('plans').select('id, name, max_active_goals'),
      client.from('plan_features').select('plan_id, feature'),
      client
        .from('prices')
        .select('id, plan_id, amount_cents, currency, billing_interval, active, sort_order')
        .eq('active', true)
        .order('sort_order', { ascending: true }),
    ]);
    const err = plans.error ?? features.error ?? prices.error;
    if (err) {
      warn('pricing catalogue', err);
      return null;
    }
    return parsePricingCatalog({ plans: plans.data, features: features.data, prices: prices.data });
  } catch (e) {
    warn('pricing catalogue', e);
    return null;
  }
}

/** The share snapshot for a token, or null (malformed, unknown, revoked, expired or unreachable: all alike). */
export async function fetchSharedCard(client: SupabaseClient | null, token: string): Promise<SharedCardViewDTO | null> {
  // Validate before any query: a malformed token never reaches the database.
  if (!client || !isShareToken(token)) return null;
  try {
    const { data, error } = await client.rpc('get_shared_card', { p_token: token });
    if (error) {
      warn('get_shared_card', error);
      return null;
    }
    return parseSharedCard(data);
  } catch (e) {
    warn('get_shared_card', e);
    return null;
  }
}

/** A fresh random visitor id (for server-side events that have no browser id). */
export function randomVisitorId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** Records an analytics event. Best effort: never throws, never blocks a page on failure. */
export async function trackEvent(
  client: SupabaseClient | null,
  name: string,
  props: Record<string, string | number | boolean>,
  anonId: string | null,
): Promise<void> {
  if (!client) return;
  try {
    const { error } = await client.rpc('track_event', { p_name: name, p_props: props, p_anon_id: anonId });
    if (error) warn('track_event', error);
  } catch (e) {
    warn('track_event', e);
  }
}

/** The signed-in user's plan (get_my_plan), or null when signed out/unavailable. */
export async function fetchMyPlan(client: SupabaseClient | null): Promise<MyPlanDTO | null> {
  if (!client) return null;
  try {
    const { data, error } = await client.rpc('get_my_plan');
    if (error) {
      warn('get_my_plan', error);
      return null;
    }
    return parseMyPlan(data);
  } catch (e) {
    warn('get_my_plan', e);
    return null;
  }
}

/** True only when the database says the caller is an admin. Any error, or no session, is "no". */
export async function isAdmin(client: SupabaseClient | null): Promise<boolean> {
  if (!client) return false;
  try {
    const { data, error } = await client.rpc('am_i_admin');
    return !error && data === true;
  } catch {
    return false;
  }
}

/** admin_metrics() for an admin; null for anyone else (HG403) or on failure. */
export async function fetchAdminMetrics(client: SupabaseClient | null): Promise<AdminMetricsDTO | null> {
  if (!client) return null;
  try {
    const { data, error } = await client.rpc('admin_metrics');
    if (error) {
      if ((error as { code?: string }).code !== 'HG403') warn('admin_metrics', error);
      return null;
    }
    return parseAdminMetrics(data);
  } catch (e) {
    warn('admin_metrics', e);
    return null;
  }
}
