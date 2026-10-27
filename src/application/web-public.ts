/**
 * Pure validators and parsers for the public web surface (landing, pricing, share links, referrals) and the
 * billing/admin pages. Everything the database or an Edge Function returns is parsed here before it reaches a
 * page, so a page renders only fields it knows about (never "whatever came back").
 */
import { z } from 'zod';

// ---------- input formats ----------

export const SHARE_TOKEN_RE = /^[a-f0-9]{64}$/;
export const REFERRAL_CODE_RE = /^[a-f0-9]{10}$/;
/** The visitor-id format track_event accepts. */
export const VISITOR_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
/** Property values track_event accepts as strings. */
export const EVENT_TOKEN_RE = /^[a-z0-9_]{1,32}$/;

export function isShareToken(v: unknown): v is string {
  return typeof v === 'string' && SHARE_TOKEN_RE.test(v);
}

export function isReferralCode(v: unknown): v is string {
  return typeof v === 'string' && REFERRAL_CODE_RE.test(v);
}

/** The referral code from a query value (string | string[] | undefined), or undefined when absent/invalid. */
export function referralFrom(v: unknown): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return isReferralCode(s) ? s : undefined;
}

/**
 * A same-origin relative path that is safe to redirect to after sign-in/up, or undefined. Rejects absolute
 * and protocol-relative URLs ("//evil", "/\\evil"), control characters and anything unusually long.
 */
export function safeNextPath(v: unknown): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== 'string' || s.length > 200) return undefined;
  if (!/^\/(?![/\\])[A-Za-z0-9\-._~/?=&%]*$/.test(s)) return undefined;
  return s;
}

// ---------- analytics ----------

/** Events a browser visitor may send through the web app's tracking action. */
export const BROWSER_EVENTS = ['landing_page_viewed', 'upgrade_page_viewed'] as const;
export type BrowserEvent = (typeof BROWSER_EVENTS)[number];

export function isBrowserEvent(v: unknown): v is BrowserEvent {
  return typeof v === 'string' && (BROWSER_EVENTS as readonly string[]).includes(v);
}

/**
 * The attribution source for a page view: 'referral' when ?ref is a valid code, otherwise a utm_source
 * token (lower-cased; dropped unless it is a short [a-z0-9_] token). Undefined when neither is present.
 */
export function attributionSource(params: { ref?: string | null; utmSource?: string | null }): string | undefined {
  if (isReferralCode(params.ref)) return 'referral';
  const utm = params.utmSource?.trim().toLowerCase();
  return utm && EVENT_TOKEN_RE.test(utm) ? utm : undefined;
}

// ---------- pricing catalogue ----------

export type BillingInterval = 'month' | 'year';
export type PriceId = 'pro_monthly' | 'pro_annual';
export const PRICE_IDS: readonly PriceId[] = ['pro_monthly', 'pro_annual'];

export function isPriceId(v: unknown): v is PriceId {
  return typeof v === 'string' && (PRICE_IDS as readonly string[]).includes(v);
}

export interface PlanDTO {
  id: 'free' | 'pro';
  name: string;
  /** null = no limit. */
  maxActiveGoals: number | null;
  features: string[];
}

export interface PriceDTO {
  id: string;
  planId: 'free' | 'pro';
  amountCents: number;
  currency: string;
  interval: BillingInterval;
}

export interface PricingCatalogDTO {
  plans: PlanDTO[];
  /** Active prices, in display order. */
  prices: PriceDTO[];
}

const planRow = z.object({
  id: z.enum(['free', 'pro']),
  name: z.string().min(1).max(80),
  max_active_goals: z.number().int().positive().nullable(),
});
const featureRow = z.object({ plan_id: z.enum(['free', 'pro']), feature: z.string().min(1).max(64) });
const priceRow = z.object({
  id: z.string().min(1).max(64),
  plan_id: z.enum(['free', 'pro']),
  amount_cents: z.number().int().positive(),
  currency: z.string().regex(/^[a-z]{3}$/),
  billing_interval: z.enum(['month', 'year']),
  active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

/** Builds the catalogue from the three public tables' rows. Throws on malformed rows. */
export function parsePricingCatalog(rows: { plans: unknown; features: unknown; prices: unknown }): PricingCatalogDTO {
  const plans = z.array(planRow).parse(rows.plans);
  const features = z.array(featureRow).parse(rows.features);
  const prices = z
    .array(priceRow)
    .parse(rows.prices)
    .filter((p) => p.active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return {
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      maxActiveGoals: p.max_active_goals,
      features: features.filter((f) => f.plan_id === p.id).map((f) => f.feature).sort(),
    })),
    prices: prices.map((p) => ({
      id: p.id,
      planId: p.plan_id,
      amountCents: p.amount_cents,
      currency: p.currency,
      interval: p.billing_interval,
    })),
  };
}

/** Per-month equivalent of a price, in cents (annual / 12, unrounded). */
export function monthlyEquivalentCents(price: Pick<PriceDTO, 'amountCents' | 'interval'>): number {
  return price.interval === 'year' ? price.amountCents / 12 : price.amountCents;
}

// ---------- shared cards ----------

const shortText = z.string().max(500);
const count = z.number().int().nonnegative();

/** Only these fields of a share snapshot are ever rendered; anything else in the payload is dropped. */
const sharedCardSchema = z.object({
  kind: z.enum(['progress', 'weekly', 'challenge']).catch('progress'),
  goalTitle: shortText.optional().catch(undefined),
  name: z.string().max(80).optional().catch(undefined),
  stats: z
    .object({
      tasksDone: count.optional(),
      tasksTotal: count.optional(),
      keyAreas: count.optional(),
      actionsPlanned: count.optional(),
      weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      tasksCompleted: count.optional(),
      tasksDue: count.optional(),
      routineChecks: count.optional(),
      day: count.optional(),
      completed: z.boolean().optional(),
      activeDays: count.optional(),
    })
    .optional()
    .catch(undefined),
  accomplishment: shortText.optional().catch(undefined),
  milestone: shortText.optional().catch(undefined),
  lesson: shortText.optional().catch(undefined),
  nextPriority: shortText.optional().catch(undefined),
});

export type SharedCardDTO = z.infer<typeof sharedCardSchema>;

export interface SharedCardViewDTO {
  card: SharedCardDTO;
  createdAt: string | null;
  /** The sharer's referral code (for "Start your own"), when valid. */
  ref: string | undefined;
}

/** Parses get_shared_card's result. null for null/unknown shapes (the page then shows the generic 404). */
export function parseSharedCard(raw: unknown): SharedCardViewDTO | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { card?: unknown; createdAt?: unknown; ref?: unknown };
  if (!r.card || typeof r.card !== 'object') return null;
  const card = sharedCardSchema.safeParse(r.card);
  if (!card.success) return null;
  // Strip undefined keys so "present" means present.
  const clean = Object.fromEntries(Object.entries(card.data).filter(([, v]) => v !== undefined)) as SharedCardDTO;
  if (clean.stats) {
    clean.stats = Object.fromEntries(Object.entries(clean.stats).filter(([, v]) => v !== undefined));
    if (Object.keys(clean.stats).length === 0) delete clean.stats;
  }
  return {
    card: clean,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : null,
    ref: isReferralCode(r.ref) ? r.ref : undefined,
  };
}

// ---------- my plan ----------

const myPlanSchema = z.object({
  plan: z.enum(['free', 'pro']),
  features: z.array(z.string()).catch([]),
  maxActiveGoals: z.number().int().nullable().catch(null),
  activeGoals: z.number().int().nonnegative().catch(0),
  overLimit: z.boolean().catch(false),
  subscription: z
    .object({
      status: z.string(),
      priceId: z.string().nullable().catch(null),
      currentPeriodEnd: z.string().nullable().catch(null),
      cancelAtPeriodEnd: z.boolean().catch(false),
      hasBillingAccount: z.boolean().catch(false),
    })
    .nullable()
    .catch(null),
  grant: z.object({ expiresAt: z.string().nullable().catch(null) }).nullable().catch(null),
});

export type MyPlanDTO = z.infer<typeof myPlanSchema>;

export function parseMyPlan(raw: unknown): MyPlanDTO | null {
  const r = myPlanSchema.safeParse(raw);
  return r.success ? r.data : null;
}

// ---------- admin metrics ----------

const n = z.number().catch(0);
const adminMetricsSchema = z.object({
  generatedAt: z.string().catch(''),
  users: z.object({
    total: n,
    withGoal: n,
    withFirstCompletion: n,
    weeklyActive: n,
    newByWeek: z.array(z.object({ week: z.string(), count: n })).catch([]),
  }),
  challenge: z.object({ joined: n, active: n, completed: n, left: n }),
  sharing: z.object({
    cardsGenerated: n,
    linksCreated: n,
    linkViews: n,
    referralSignups: n,
    referralConversions: n,
  }),
  billing: z.object({
    source: z.string().catch(''),
    activeSubscriptions: n,
    pastDue: n,
    cancellingAtPeriodEnd: n,
    cancelledLast30Days: n,
    mrrCents: n,
    currency: z.string().regex(/^[a-z]{3}$/).catch('usd'),
    compedUsers: n,
    freeToPaidRate: z.number().nullable().catch(null),
  }),
  funnel30d: z.record(z.string(), z.number()).catch({}),
});

export type AdminMetricsDTO = z.infer<typeof adminMetricsSchema>;

export function parseAdminMetrics(raw: unknown): AdminMetricsDTO | null {
  const r = adminMetricsSchema.safeParse(raw);
  return r.success ? r.data : null;
}

// ---------- billing Edge Functions ----------

export type BillingFailureCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'CONFLICT'
  | 'NOT_CONFIGURED'
  | 'UNAVAILABLE'
  | 'INTERNAL';

const BILLING_CODES: readonly BillingFailureCode[] = [
  'VALIDATION',
  'UNAUTHENTICATED',
  'CONFLICT',
  'NOT_CONFIGURED',
  'UNAVAILABLE',
  'INTERNAL',
];

export function isBillingFailureCode(v: unknown): v is BillingFailureCode {
  return typeof v === 'string' && (BILLING_CODES as readonly string[]).includes(v);
}

export type BillingRedirectResult = { ok: true; url: string } | { ok: false; code: BillingFailureCode };

/** Only Stripe-hosted pages are acceptable redirect targets for checkout and the customer portal. */
export function isStripeUrl(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && (u.hostname === 'stripe.com' || u.hostname.endsWith('.stripe.com'));
  } catch {
    return false;
  }
}

/** Interprets a billing Edge Function's JSON body ({ok, data:{url}} or {ok:false, error:{code}}). */
export function parseBillingResponse(body: unknown): BillingRedirectResult {
  const b = (body ?? {}) as { ok?: unknown; data?: { url?: unknown }; url?: unknown; error?: { code?: unknown } };
  const url = b.data?.url ?? b.url;
  if (b.ok !== false && isStripeUrl(url)) return { ok: true, url };
  const code = b.error?.code;
  return { ok: false, code: isBillingFailureCode(code) ? code : 'INTERNAL' };
}
