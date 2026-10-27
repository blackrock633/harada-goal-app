// @vitest-environment jsdom
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Server pages of the public web surface, rendered by calling the async components directly.
 * MOCKED: the Supabase server clients (a fake with `rpc` / `from`), next/navigation's notFound, and the session.
 */
class NotFoundError extends Error {
  constructor() {
    super('NEXT_NOT_FOUND');
  }
}

type RpcResult = { data: unknown; error: unknown };
const rpc = vi.fn<(name: string, args?: unknown) => Promise<RpcResult>>();
const tables: Record<string, RpcResult> = {};

function query(table: string) {
  const result = () => Promise.resolve(tables[table] ?? { data: null, error: { code: 'XX' } });
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = () => q;
  q.order = () => q;
  q.then = (ok: (v: RpcResult) => unknown, bad: (e: unknown) => unknown) => result().then(ok, bad);
  return q;
}
const fakeClient = { rpc, from: (t: string) => query(t) };
let clientAvailable = true;

vi.mock('@/infrastructure/supabase/server', () => ({
  anonSupabase: () => (clientAvailable ? fakeClient : null),
  userSupabase: async () => (clientAvailable ? fakeClient : null),
  verifiedAccessToken: async () => null,
  callEdgeFunction: async () => ({ status: 503, body: null }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFoundError();
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  usePathname: () => '/',
}));
const getCtx = vi.fn(async () => null as unknown);
vi.mock('@/app/lib/session', () => ({ getCtx: () => getCtx(), requireCtx: async () => ({ userId: 'u' }) }));
vi.mock('@/app/actions/billing', () => ({
  trackBrowserEventAction: async () => undefined,
  startCheckoutAction: async () => undefined,
  openBillingPortalAction: async () => undefined,
}));

const TOKEN = '0123456789abcdef'.repeat(4);

beforeEach(() => {
  rpc.mockReset();
  for (const k of Object.keys(tables)) delete tables[k];
  clientAvailable = true;
  getCtx.mockResolvedValue(null);
});
afterEach(() => cleanup());

async function renderPage(el: Promise<React.ReactElement> | React.ReactElement) {
  return render(await el);
}

describe('/s/[token] share page', () => {
  async function page(token: string) {
    const { default: SharedPage } = await import('./s/[token]/page');
    return SharedPage({ params: Promise.resolve({ token }) });
  }

  it.each(['short', 'A'.repeat(64), `${'a'.repeat(63)}'`, '../../api/health'])(
    'answers a malformed token (%s) with the generic 404 without querying',
    async (token) => {
      await expect(page(token)).rejects.toBeInstanceOf(NotFoundError);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it('answers an unknown, revoked or expired token (null) with the same 404', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(page(TOKEN)).rejects.toBeInstanceOf(NotFoundError);
    expect(rpc).toHaveBeenCalledWith('get_shared_card', { p_token: TOKEN });
  });

  it('answers a database error with the same 404', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '57014' } });
    await expect(page(TOKEN)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('renders only the snapshot fields that are present, as text', async () => {
    rpc.mockImplementation(async (name) =>
      name === 'get_shared_card'
        ? {
            data: {
              card: {
                kind: 'progress',
                goalTitle: '<img src=x onerror=alert(1)>Run a marathon',
                stats: { tasksDone: 3, tasksTotal: 10 },
                lesson: 'Rest days matter',
                // Not part of the card contract: must never be rendered.
                vision: 'PRIVATE VISION TEXT',
                purpose: { selfTangible: 'PRIVATE PURPOSE' },
                email: 'owner@example.com',
              },
              createdAt: '2026-10-20T10:00:00Z',
              ref: 'abcdef0123',
            },
            error: null,
          }
        : { data: null, error: null },
    );
    const { container } = await renderPage(page(TOKEN));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('<img src=x onerror=alert(1)>Run a marathon');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('3 of 10 tasks done')).toBeInTheDocument();
    expect(screen.getByText('Rest days matter')).toBeInTheDocument();
    expect(screen.getByText('Lesson')).toBeInTheDocument();
    // Absent fields render nothing (no empty labels).
    for (const label of ['Accomplishment', 'Milestone', 'Next priority']) expect(screen.queryByText(label)).toBeNull();
    expect(container.querySelector('[data-field="name"]')).toBeNull();
    // Extra payload fields never reach the page.
    const html = container.innerHTML;
    for (const secret of ['PRIVATE VISION TEXT', 'PRIVATE PURPOSE', 'owner@example.com']) expect(html).not.toContain(secret);
    // "Start your own" carries the sharer's referral code.
    expect(screen.getByRole('link', { name: 'Start your own' }).getAttribute('href')).toBe('/signup?ref=abcdef0123');
    // The view is tracked as an anonymous visitor.
    expect(rpc).toHaveBeenCalledWith('track_event', expect.objectContaining({ p_name: 'shared_page_viewed' }));
  });

  it('is noindex', async () => {
    const mod = await import('./s/[token]/page');
    expect(mod.metadata.robots).toMatchObject({ index: false, follow: false });
  });
});

describe('/admin', () => {
  async function page() {
    const { default: AdminPage } = await import('./admin/page');
    return AdminPage();
  }

  it('is a 404 for signed-in non-admins, without asking for metrics', async () => {
    rpc.mockImplementation(async (name) => (name === 'am_i_admin' ? { data: false, error: null } : { data: null, error: null }));
    await expect(page()).rejects.toBeInstanceOf(NotFoundError);
    expect(rpc).not.toHaveBeenCalledWith('admin_metrics', undefined);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['am_i_admin']);
  });

  it('is a 404 when signed out (the RPC is not granted to anon)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(page()).rejects.toBeInstanceOf(NotFoundError);
  });

  it('is a 404 when Supabase is not configured', async () => {
    clientAvailable = false;
    await expect(page()).rejects.toBeInstanceOf(NotFoundError);
  });

  it('is a 404 when admin_metrics refuses (HG403) even if am_i_admin said yes', async () => {
    rpc.mockImplementation(async (name) =>
      name === 'am_i_admin' ? { data: true, error: null } : { data: null, error: { code: 'HG403' } },
    );
    await expect(page()).rejects.toBeInstanceOf(NotFoundError);
  });

  it('renders the metrics for an admin, with MRR as currency and ARR as a projection', async () => {
    rpc.mockImplementation(async (name) =>
      name === 'am_i_admin'
        ? { data: true, error: null }
        : {
            data: {
              generatedAt: '2026-10-26T12:00:00Z',
              users: { total: 10, withGoal: 5, withFirstCompletion: 2, weeklyActive: 3, newByWeek: [{ week: '2026-10-19', count: 4 }] },
              challenge: { joined: 2, active: 1, completed: 1, left: 0 },
              sharing: { cardsGenerated: 1, linksCreated: 1, linkViews: 7, referralSignups: 1, referralConversions: 0 },
              billing: {
                source: 'x', activeSubscriptions: 2, pastDue: 1, cancellingAtPeriodEnd: 0, cancelledLast30Days: 0,
                mrrCents: 1215, currency: 'usd', compedUsers: 0, freeToPaidRate: 0.2,
              },
              funnel30d: { landing_page_viewed: 40, signup_completed: 4 },
            },
            error: null,
          },
    );
    await renderPage(page());
    expect(screen.getByRole('heading', { name: 'Metrics' })).toBeInTheDocument();
    expect(screen.getByText('$12.15')).toBeInTheDocument();
    expect(screen.getByText('$145.80')).toBeInTheDocument();
    expect(screen.getByText('ARR (projection)')).toBeInTheDocument();
    expect(screen.getByText(/From Stripe subscription state \(webhooks\)/)).toBeInTheDocument();
    expect(screen.getByText(/trials and past-due subscriptions are excluded/)).toBeInTheDocument();
  });
});

describe('/billing/success', () => {
  const plan = (p: 'free' | 'pro') => ({
    data: { plan: p, features: [], maxActiveGoals: p === 'pro' ? null : 1, activeGoals: 1, overLimit: false, subscription: null, grant: null },
    error: null,
  });
  async function page() {
    const { default: BillingSuccessPage } = await import('./billing/success/page');
    return BillingSuccessPage({ searchParams: Promise.resolve({ session_id: 'cs_test_123' }) });
  }

  it('says Pro is active only when get_my_plan reports plan === "pro"', async () => {
    rpc.mockResolvedValue(plan('pro'));
    await renderPage(page());
    expect(screen.getByRole('heading', { name: 'Harada Pro is active' })).toBeInTheDocument();
  });

  it('does not claim success while the plan is still free', async () => {
    rpc.mockResolvedValue(plan('free'));
    const { container } = await renderPage(page());
    expect(container.textContent).not.toContain('Harada Pro is active');
    expect(screen.getByText(/confirming/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Refresh' }).getAttribute('href')).toBe('/billing/success?session_id=cs_test_123');
  });

  it('does not claim success when the plan cannot be read', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    const { container } = await renderPage(page());
    expect(container.textContent).not.toContain('Harada Pro is active');
  });
});

describe('/pricing', () => {
  async function page(params: Record<string, string> = {}) {
    const { default: PricingPage } = await import('./pricing/page');
    return PricingPage({ searchParams: Promise.resolve(params) });
  }

  function catalog(monthly: number, annual: number) {
    tables.plans = {
      data: [
        { id: 'free', name: 'Free', max_active_goals: 1 },
        { id: 'pro', name: 'Harada Pro', max_active_goals: null },
      ],
      error: null,
    };
    tables.plan_features = { data: [{ plan_id: 'pro', feature: 'multiple_goals' }], error: null };
    tables.prices = {
      data: [
        { id: 'pro_monthly', plan_id: 'pro', amount_cents: monthly, currency: 'usd', billing_interval: 'month', active: true, sort_order: 1 },
        { id: 'pro_annual', plan_id: 'pro', amount_cents: annual, currency: 'usd', billing_interval: 'year', active: true, sort_order: 2 },
      ],
      error: null,
    };
  }

  it('shows the amounts from the prices table, with an honest per-month equivalent', async () => {
    catalog(1234, 9600);
    await renderPage(page());
    expect(screen.getByTestId('price-pro_monthly').textContent).toContain('$12.34');
    const annual = screen.getByTestId('price-pro_annual').textContent!;
    expect(annual).toContain('$96.00');
    expect(annual).toContain('$8.00 a month');
    expect(annual).toContain('$52.08 less than twelve monthly payments');
    // Signed out: upgrade goes to sign-up and back to pricing.
    expect(screen.getAllByRole('link', { name: /Upgrade/ })[0]!.getAttribute('href')).toBe('/signup?next=%2Fpricing');
    expect(screen.getByText('Renews every month/year until you cancel.')).toBeInTheDocument();
  });

  it('follows the database when prices change (nothing hardcoded)', async () => {
    catalog(500, 5000);
    await renderPage(page());
    expect(screen.getByTestId('price-pro_monthly').textContent).toContain('$5.00');
    expect(screen.queryByText(/\$7\.99/)).toBeNull();
  });

  it('renders the Free tier and "Pro pricing unavailable" when the database is unreachable', async () => {
    tables.plans = { data: null, error: { code: 'PGRST000' } };
    await renderPage(page());
    expect(screen.getByRole('heading', { name: 'Free' })).toBeInTheDocument();
    expect(screen.getByTestId('pro-unavailable').textContent).toBe('Pro pricing unavailable right now.');
  });

  it('shows the fixed NOT_CONFIGURED wording and never echoes the query', async () => {
    catalog(799, 4999);
    await renderPage(page({ error: 'NOT_CONFIGURED' }));
    expect(screen.getByRole('alert').textContent).toBe("Upgrades aren't available yet. Nothing was charged.");
    cleanup();
    await renderPage(page({ error: '<b>pwned</b>' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('/challenge', () => {
  async function page() {
    const { default: ChallengePage } = await import('./challenge/page');
    return ChallengePage();
  }

  it('shows the Harada Pro upgrade prompt for signed-out or Free users', async () => {
    await renderPage(page());
    expect(screen.getByTestId('upgrade-prompt-challenge')).toHaveTextContent('Commit to 30 Days of Progress.');
    expect(screen.getAllByRole('link', { name: 'See Harada Pro' })[0]!.getAttribute('href')).toBe('/pricing');
  });

  it('hides the upgrade prompt and links to Today for Pro users', async () => {
    getCtx.mockResolvedValue({ userId: 'u', now: new Date(), today: '2026-10-26' });
    rpc.mockResolvedValue({
      data: { plan: 'pro', features: ['challenge'], maxActiveGoals: null, activeGoals: 1, overLimit: false, subscription: null, grant: null },
      error: null,
    });
    await renderPage(page());
    expect(screen.queryByTestId('upgrade-prompt-challenge')).toBeNull();
    expect(screen.getByRole('link', { name: 'Go to Today' }).getAttribute('href')).toBe('/today');
  });
});
