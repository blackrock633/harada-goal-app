import type { MyPlanDTO } from '@/application/web-public';

/** Display helpers for /account/billing (pure). Dates are shown in UTC, as Stripe reports them. */
export function formatBillingDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(d);
}

const INTERVAL: Record<string, string> = { pro_monthly: 'Monthly', pro_annual: 'Yearly' };

export function intervalLabel(priceId: string | null): string | null {
  return (priceId && INTERVAL[priceId]) || null;
}

/** The renewal/cancellation line for the current subscription, from Stripe's last reported state. */
export function subscriptionLine(plan: MyPlanDTO): { text: string; tone: 'normal' | 'warning' } | null {
  const s = plan.subscription;
  if (!s) return null;
  const end = formatBillingDate(s.currentPeriodEnd);
  if (s.status === 'past_due' || s.status === 'unpaid') {
    return {
      text: 'Your last payment didn’t go through. Update your card in Manage billing to keep Harada Pro.',
      tone: 'warning',
    };
  }
  if (s.status === 'active' || s.status === 'trialing') {
    if (s.cancelAtPeriodEnd) return { text: end ? `Cancels on ${end}. You keep Pro until then.` : 'Cancels at the end of the paid period.', tone: 'normal' };
    return { text: end ? `Renews on ${end}.` : 'Renews automatically until you cancel.', tone: 'normal' };
  }
  if (s.status === 'canceled') return { text: end ? `Cancelled. Pro ended on ${end}.` : 'Cancelled.', tone: 'normal' };
  return null;
}

