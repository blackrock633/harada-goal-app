import * as React from 'react';
import type { AdminMetricsDTO } from '@/application/web-public';
import { formatMoney } from '@/ui/features/marketing/money';

const FUNNEL_ORDER = [
  'landing_page_viewed',
  'signup_started',
  'signup_completed',
  'onboarding_started',
  'goal_created',
  'supporting_area_created',
  'first_action_created',
  'first_action_completed',
  'weekly_review_completed',
  'challenge_joined',
  'challenge_day_completed',
  'challenge_completed',
  'progress_card_generated',
  'share_link_created',
  'shared_page_viewed',
  'referral_signup_completed',
  'upgrade_page_viewed',
  'upgrade_prompt_shown',
  'checkout_started',
  'subscription_activated',
  'subscription_cancelled',
  'premium_feature_used',
];

const num = (n: number) => new Intl.NumberFormat('en-US').format(n);
const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—');

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="min-w-0 border-t border-rule pt-3">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-2xl font-semibold text-ink">{value}</dd>
      {note && <dd className="text-sm text-ink-muted">{note}</dd>}
    </div>
  );
}

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className="mt-10 min-w-0">
      <h2 id={id} className="font-serif text-xl text-ink">{title}</h2>
      {note && <p className="mt-1 text-sm text-ink-muted">{note}</p>}
      <dl className="mt-4 grid min-w-0 grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">{children}</dl>
    </section>
  );
}

/** Server-rendered operator metrics from admin_metrics(). Read-only; no client code. */
export function AdminMetricsView({ metrics: m }: { metrics: AdminMetricsDTO }) {
  const u = m.users;
  const b = m.billing;
  const generated = m.generatedAt ? new Date(m.generatedAt) : null;
  const funnel = [
    ...FUNNEL_ORDER.filter((k) => k in m.funnel30d),
    ...Object.keys(m.funnel30d).filter((k) => !FUNNEL_ORDER.includes(k)).sort(),
  ];
  return (
    <main id="main-content" className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-8">
      <h1 className="font-serif text-3xl font-medium text-ink">Metrics</h1>
      {generated && !Number.isNaN(generated.getTime()) && (
        <p className="mt-1 text-sm text-ink-muted">Generated {generated.toISOString().replace('T', ' ').slice(0, 16)} UTC</p>
      )}

      <Block title="Users and activation">
        <Stat label="Accounts" value={num(u.total)} />
        <Stat label="Created a goal" value={num(u.withGoal)} note={pct(u.withGoal, u.total)} />
        <Stat label="Completed a first action" value={num(u.withFirstCompletion)} note={pct(u.withFirstCompletion, u.total)} />
        <Stat label="Active in the last 7 days" value={num(u.weeklyActive)} note={pct(u.weeklyActive, u.total)} />
      </Block>

      {u.newByWeek.length > 0 && (
        <section aria-labelledby="weeks-heading" className="mt-8 min-w-0">
          <h3 id="weeks-heading" className="font-serif text-lg text-ink">New accounts by week</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[280px] text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-ink-muted">
                  <th scope="col" className="py-2 pr-4 font-normal">Week starting</th>
                  <th scope="col" className="py-2 text-right font-normal">New accounts</th>
                </tr>
              </thead>
              <tbody>
                {u.newByWeek.map((w) => (
                  <tr key={w.week} className="border-b border-rule">
                    <td className="py-1.5 pr-4 text-ink">{w.week.slice(0, 10)}</td>
                    <td className="py-1.5 text-right text-ink">{num(w.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Block title="30-Day Challenge">
        <Stat label="Joined (all time)" value={num(m.challenge.joined)} />
        <Stat label="Running now" value={num(m.challenge.active)} />
        <Stat label="Finished 30 days" value={num(m.challenge.completed)} note={pct(m.challenge.completed, m.challenge.joined)} />
        <Stat label="Left early" value={num(m.challenge.left)} />
      </Block>

      <Block title="Sharing and referrals">
        <Stat label="Cards generated" value={num(m.sharing.cardsGenerated)} />
        <Stat label="Links created" value={num(m.sharing.linksCreated)} />
        <Stat label="Link views" value={num(m.sharing.linkViews)} />
        <Stat label="Referral sign-ups" value={num(m.sharing.referralSignups)} />
        <Stat
          label="Referral paid conversions"
          value={num(m.sharing.referralConversions)}
          note={pct(m.sharing.referralConversions, m.sharing.referralSignups)}
        />
      </Block>

      <Block
        title="Billing"
        note="From Stripe subscription state (webhooks). MRR counts active subscriptions only: trials and past-due subscriptions are excluded; annual plans count as one twelfth per month."
      >
        <Stat label="MRR" value={formatMoney(b.mrrCents, b.currency)} />
        <Stat label="ARR (projection)" value={formatMoney(b.mrrCents * 12, b.currency)} note="MRR × 12, not booked revenue" />
        <Stat label="Active or trialing subscriptions" value={num(b.activeSubscriptions)} />
        <Stat label="Past due" value={num(b.pastDue)} />
        <Stat label="Cancelling at period end" value={num(b.cancellingAtPeriodEnd)} />
        <Stat label="Cancelled in the last 30 days" value={num(b.cancelledLast30Days)} />
        <Stat label="Complimentary Pro" value={num(b.compedUsers)} />
        <Stat
          label="Free to paid (ever)"
          value={b.freeToPaidRate === null ? '—' : `${(b.freeToPaidRate * 100).toFixed(1)}%`}
          note="Accounts that ever had a paid subscription"
        />
      </Block>

      <section aria-labelledby="funnel-heading" className="mt-10 min-w-0">
        <h2 id="funnel-heading" className="font-serif text-xl text-ink">Events, last 30 days</h2>
        <p className="mt-1 text-sm text-ink-muted">Raw event counts (not unique people).</p>
        {funnel.length === 0 ? (
          <p className="mt-4 text-ink-muted">No events recorded yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[280px] text-sm">
              <tbody>
                {funnel.map((k) => (
                  <tr key={k} className="border-b border-rule">
                    <th scope="row" className="py-1.5 pr-4 text-left font-normal text-ink [overflow-wrap:anywhere]">{k}</th>
                    <td className="py-1.5 text-right text-ink">{num(m.funnel30d[k] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
