import { describe, expect, it } from 'vitest';
import {
  attributionSource,
  isReferralCode,
  isShareToken,
  isStripeUrl,
  monthlyEquivalentCents,
  parseBillingResponse,
  parsePricingCatalog,
  parseSharedCard,
  referralFrom,
  safeNextPath,
} from './web-public';
import { signUpSchema } from './schemas';

const TOKEN = 'a'.repeat(64);

describe('share token validation', () => {
  it('accepts exactly 64 lower-case hex characters', () => {
    expect(isShareToken(TOKEN)).toBe(true);
    expect(isShareToken('0123456789abcdef'.repeat(4))).toBe(true);
  });
  it.each([
    ['too short', 'a'.repeat(63)],
    ['too long', 'a'.repeat(65)],
    ['upper case', 'A'.repeat(64)],
    ['non-hex', 'g'.repeat(64)],
    ['path traversal', '../'.repeat(21) + 'a'],
    ['sql', `${'a'.repeat(60)}' or`],
    ['empty', ''],
  ])('rejects %s', (_label, v) => {
    expect(isShareToken(v)).toBe(false);
  });
  it('rejects non-strings', () => {
    expect(isShareToken(undefined)).toBe(false);
    expect(isShareToken(['a'.repeat(64)])).toBe(false);
  });
});

describe('referral codes', () => {
  it('accepts 10 lower-case hex characters only', () => {
    expect(isReferralCode('0123456789')).toBe(true);
    expect(isReferralCode('abcdef0123')).toBe(true);
    for (const bad of ['012345678', '01234567890', 'ABCDEF0123', 'zzzzzzzzzz', '<script>12', '']) {
      expect(isReferralCode(bad)).toBe(false);
    }
  });
  it('referralFrom takes the first query value and drops invalid ones', () => {
    expect(referralFrom(['abcdef0123', 'x'])).toBe('abcdef0123');
    expect(referralFrom('nope')).toBeUndefined();
    expect(referralFrom(undefined)).toBeUndefined();
  });
  it('the sign-up schema keeps a valid code and silently drops an invalid one', () => {
    const base = { email: 'a@example.com', password: 'long-enough-pw', displayName: 'A', timeZone: 'UTC' };
    expect(signUpSchema.parse({ ...base, referralCode: 'abcdef0123' }).referralCode).toBe('abcdef0123');
    expect(signUpSchema.parse({ ...base, referralCode: 'DROP TABLE' }).referralCode).toBeUndefined();
    expect(signUpSchema.parse(base).referralCode).toBeUndefined();
  });
});

describe('safeNextPath', () => {
  it('allows same-origin relative paths', () => {
    expect(safeNextPath('/pricing')).toBe('/pricing');
    expect(safeNextPath('/account/billing?x=1')).toBe('/account/billing?x=1');
  });
  it.each(['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', 'pricing', '/a b', '/\nx', ''])(
    'rejects %j',
    (v) => {
      expect(safeNextPath(v)).toBeUndefined();
    },
  );
});

describe('attributionSource', () => {
  it('prefers a valid referral, else a utm_source token', () => {
    expect(attributionSource({ ref: 'abcdef0123', utmSource: 'newsletter' })).toBe('referral');
    expect(attributionSource({ ref: 'bad', utmSource: 'Newsletter' })).toBe('newsletter');
    expect(attributionSource({ utmSource: 'free text with spaces' })).toBeUndefined();
    expect(attributionSource({})).toBeUndefined();
  });
});

describe('parseSharedCard', () => {
  it('keeps only known snapshot fields', () => {
    const v = parseSharedCard({
      card: {
        kind: 'progress',
        goalTitle: 'Run a marathon',
        stats: { tasksDone: 3, tasksTotal: 10, secret: 'x' },
        vision: 'PRIVATE VISION',
        ownerId: 'uuid',
        email: 'me@example.com',
      },
      createdAt: '2026-10-01T00:00:00Z',
      ref: 'abcdef0123',
    });
    expect(v).not.toBeNull();
    expect(Object.keys(v!.card).sort()).toEqual(['goalTitle', 'kind', 'stats']);
    expect(v!.card.stats).toEqual({ tasksDone: 3, tasksTotal: 10 });
    expect(v!.ref).toBe('abcdef0123');
  });
  it('returns null for null and malformed results, and drops an invalid ref', () => {
    expect(parseSharedCard(null)).toBeNull();
    expect(parseSharedCard({})).toBeNull();
    expect(parseSharedCard('card')).toBeNull();
    expect(parseSharedCard({ card: { kind: 'weekly' }, ref: 'javascript:' })!.ref).toBeUndefined();
  });
});

describe('pricing catalogue', () => {
  it('builds plans and active prices in sort order from the table rows', () => {
    const c = parsePricingCatalog({
      plans: [
        { id: 'free', name: 'Free', max_active_goals: 1 },
        { id: 'pro', name: 'Harada Pro', max_active_goals: null },
      ],
      features: [{ plan_id: 'pro', feature: 'multiple_goals' }],
      prices: [
        { id: 'pro_annual', plan_id: 'pro', amount_cents: 6000, currency: 'eur', billing_interval: 'year', active: true, sort_order: 2 },
        { id: 'pro_monthly', plan_id: 'pro', amount_cents: 600, currency: 'eur', billing_interval: 'month', active: true, sort_order: 1 },
        { id: 'old', plan_id: 'pro', amount_cents: 100, currency: 'eur', billing_interval: 'month', active: false, sort_order: 0 },
      ],
    });
    expect(c.prices.map((p) => p.id)).toEqual(['pro_monthly', 'pro_annual']);
    expect(c.plans.find((p) => p.id === 'pro')!.features).toEqual(['multiple_goals']);
    expect(monthlyEquivalentCents(c.prices[1]!)).toBe(500);
  });
  it('throws on malformed rows (the page then shows "unavailable")', () => {
    expect(() => parsePricingCatalog({ plans: [], features: [], prices: [{ id: 'x', amount_cents: -1 }] })).toThrow();
  });
});

describe('billing function responses', () => {
  it('accepts only Stripe-hosted https URLs', () => {
    expect(isStripeUrl('https://checkout.stripe.com/c/pay/cs_test_1')).toBe(true);
    expect(isStripeUrl('https://billing.stripe.com/p/session/1')).toBe(true);
    expect(isStripeUrl('http://checkout.stripe.com/x')).toBe(false);
    expect(isStripeUrl('https://stripe.com.evil.example/x')).toBe(false);
    expect(isStripeUrl('https://evil.example/?stripe.com')).toBe(false);
  });
  it('maps success and known/unknown error codes', () => {
    expect(parseBillingResponse({ ok: true, data: { url: 'https://checkout.stripe.com/x' } })).toEqual({
      ok: true,
      url: 'https://checkout.stripe.com/x',
    });
    expect(parseBillingResponse({ ok: false, error: { code: 'NOT_CONFIGURED', message: 'x' } })).toEqual({
      ok: false,
      code: 'NOT_CONFIGURED',
    });
    expect(parseBillingResponse({ ok: true, data: { url: 'https://evil.example' } })).toEqual({ ok: false, code: 'INTERNAL' });
    expect(parseBillingResponse(null)).toEqual({ ok: false, code: 'INTERNAL' });
  });
});
