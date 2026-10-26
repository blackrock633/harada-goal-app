import * as React from 'react';
import { Check } from 'lucide-react';
import type { PriceDTO, PricingCatalogDTO } from '@/application/web-public';
import { annualBreakdown, annualDifference, formatMoney } from './money';

/** Plain-language names for plan_features rows. Unknown features are not shown (never invented). */
export const FEATURE_LABELS: Record<string, string> = {
  multiple_goals: 'Several active goals at once',
  progress_history: 'Full progress history for every goal',
  advanced_reviews: 'Monthly reviews and the full weekly review',
  premium_templates: 'Premium starter templates',
  ai_planning: 'Optional suggested plan drafts (you accept each item yourself)',
  insights: 'Insights on how your execution is going',
};

/** What every account gets. Describes the product, not prices, so it is safe to show without the database. */
const FREE_BASICS = [
  'The full Harada sheet: one goal, 8 key areas, 64 actions',
  'Today list of due tasks and routines',
  'Weekly reflection',
  'Keep as many draft and archived goals as you like',
];

export interface PricingPlansProps {
  catalog: PricingCatalogDTO | null;
  /** The upgrade control for a Pro price (a sign-up link or a checkout form); omitted = no buttons. */
  renderUpgrade?: (price: PriceDTO) => React.ReactNode;
  /** The control under the Free column (e.g. "Start your first goal"). */
  freeAction?: React.ReactNode;
  headingLevel?: 'h2' | 'h3';
}

/** Free vs Pro, with every amount read from the `prices` table (never hardcoded). */
export function PricingPlans({ catalog, renderUpgrade, freeAction, headingLevel = 'h3' }: PricingPlansProps) {
  const H = headingLevel;
  const free = catalog?.plans.find((p) => p.id === 'free');
  const pro = catalog?.plans.find((p) => p.id === 'pro');
  const proPrices = catalog?.prices.filter((p) => p.planId === 'pro') ?? [];
  const monthly = proPrices.find((p) => p.interval === 'month');
  const annual = proPrices.find((p) => p.interval === 'year');
  const freeLimit = free?.maxActiveGoals ?? 1;
  const proFeatures = (pro?.features ?? []).map((f) => FEATURE_LABELS[f]).filter((l): l is string => !!l);

  return (
    <div className="grid min-w-0 gap-6 md:grid-cols-2" data-testid="pricing-plans">
      <section aria-labelledby="plan-free" className="min-w-0 rounded-[var(--radius-md)] border border-rule bg-surface p-5">
        <H id="plan-free" className="font-serif text-xl text-ink">{free?.name ?? 'Free'}</H>
        <p className="mt-1 text-2xl font-semibold text-ink">{formatFree(proPrices[0]?.currency)}</p>
        <p className="mt-1 text-sm text-ink-muted">No card needed.</p>
        <ul className="mt-4 space-y-2 text-ink">
          <Feature>{freeLimit === 1 ? 'One active goal at a time' : `Up to ${freeLimit} active goals at a time`}</Feature>
          {FREE_BASICS.map((f) => <Feature key={f}>{f}</Feature>)}
        </ul>
        {freeAction && <div className="mt-5">{freeAction}</div>}
      </section>

      <section aria-labelledby="plan-pro" className="min-w-0 rounded-[var(--radius-md)] border border-accent/60 bg-surface p-5">
        <H id="plan-pro" className="font-serif text-xl text-ink">{pro?.name ?? 'Harada Pro'}</H>
        {proPrices.length === 0 ? (
          <p className="mt-2 text-ink-muted" data-testid="pro-unavailable">Pro pricing unavailable right now.</p>
        ) : (
          <ul className="mt-2 space-y-4" aria-label="Pro prices">
            {proPrices.map((p) => (
              <li key={p.id} className="min-w-0" data-testid={`price-${p.id}`}>
                <p className="text-ink">
                  <span className="text-2xl font-semibold">{formatMoney(p.amountCents, p.currency)}</span>
                  <span className="text-ink-muted"> / {p.interval === 'year' ? 'year' : 'month'}</span>
                </p>
                {p.interval === 'year' && (
                  <p className="text-sm text-ink-muted">
                    {annualBreakdown(p)} {p.id === annual?.id ? annualDifference(monthly, annual) : null}
                  </p>
                )}
                {p.interval === 'month' && <p className="text-sm text-ink-muted">Billed every month.</p>}
                {renderUpgrade && <div className="mt-2">{renderUpgrade(p)}</div>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-sm font-medium text-ink">Everything in Free, plus:</p>
        <ul className="mt-2 space-y-2 text-ink">
          {pro && pro.maxActiveGoals === null && !proFeatures.includes(FEATURE_LABELS.multiple_goals!) && (
            <Feature>No limit on active goals</Feature>
          )}
          {proFeatures.length > 0
            ? proFeatures.map((f) => <Feature key={f}>{f}</Feature>)
            : !pro && <li className="text-sm text-ink-muted">The Pro feature list is unavailable right now.</li>}
        </ul>
      </section>
    </div>
  );
}

function formatFree(currency?: string): string {
  return currency ? formatMoney(0, currency) : 'Free';
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex min-w-0 gap-2">
      <Check className="mt-1 h-4 w-4 shrink-0 text-success" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </li>
  );
}
