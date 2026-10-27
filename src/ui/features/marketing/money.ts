import { monthlyEquivalentCents, type PriceDTO } from '@/application/web-public';

/** Formats an amount in minor units (cents) with Intl. Never hardcodes a currency symbol. */
export function formatMoney(cents: number, currency: string, locale = 'en-US'): string {
  const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() });
  return fmt.format(cents / 100);
}

/** "$7.99 / month" or "$49.99 / year". */
export function priceLabel(p: PriceDTO, locale?: string): string {
  return `${formatMoney(p.amountCents, p.currency, locale)} / ${p.interval}`;
}

/** For an annual price: "about $4.17 a month, billed $49.99 once a year". null for monthly prices. */
export function annualBreakdown(p: PriceDTO, locale?: string): string | null {
  if (p.interval !== 'year') return null;
  const perMonth = Math.round(monthlyEquivalentCents(p));
  return `Works out to ${formatMoney(perMonth, p.currency, locale)} a month, billed as ${formatMoney(p.amountCents, p.currency, locale)} once a year.`;
}

/**
 * What a year of the annual price costs compared with twelve months of the monthly price, computed from the two
 * real prices (same currency only). null when there is no positive difference.
 */
export function annualDifference(monthly: PriceDTO | undefined, annual: PriceDTO | undefined, locale?: string): string | null {
  if (!monthly || !annual || monthly.currency !== annual.currency) return null;
  const diff = monthly.amountCents * 12 - annual.amountCents;
  if (diff <= 0) return null;
  return `${formatMoney(diff, annual.currency, locale)} less than twelve monthly payments.`;
}
