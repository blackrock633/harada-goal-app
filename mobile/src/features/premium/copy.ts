/**
 * Words for Harada Pro, in one place so the upgrade screen, the inline prompts and Settings say the
 * same thing. Plain statements of what each plan includes: no discounts, timers or pressure.
 */
import type { Feature, PlanInfo, Price } from '@/data/premium';

export const FEATURES: readonly Feature[] = [
  'multiple_goals',
  'progress_history',
  'advanced_reviews',
  'premium_templates',
  'ai_planning',
  'insights',
  'challenge',
];

/** A `feature` search param, or undefined when it is missing or not a known feature. */
export function parseFeature(raw: string | string[] | undefined): Feature | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return FEATURES.find((f) => f === v);
}

/** What a feature does for the user, used wherever that feature is locked. */
export const FEATURE_COPY: Record<Feature, { title: string; body: string }> = {
  multiple_goals: {
    title: 'More Goals. More Possibilities.',
    body: 'Work toward multiple ambitions simultaneously. Unlock multiple active goals with Harada Pro.',
  },
  progress_history: {
    title: 'See your weeks side by side',
    body: 'Harada Pro shows your activity week by week: tasks due and done, routine days checked and reflections, over up to 26 weeks.',
  },
  advanced_reviews: {
    title: 'Reflect. Learn. Improve.',
    body: "Weekly reflections help you evaluate your progress, identify what's holding you back, and adjust your approach. Unlock weekly reflections with Harada Pro.",
  },
  premium_templates: {
    title: 'More example plans',
    body: 'Harada Pro includes more example plans with ready-made key areas and actions. You can change every part of them.',
  },
  ai_planning: {
    title: 'Planning suggestions',
    body: 'Harada Pro can draft key areas and actions for you to look over. Nothing is added unless you add it.',
  },
  insights: {
    title: 'Completion by key area',
    body: 'Harada Pro shows how far each key area’s tasks have come, next to your weekly history.',
  },
  challenge: {
    title: 'Commit to 30 Days of Progress.',
    body: 'Turn your goal into a structured daily practice with the Harada 30-Day Challenge. Unlock the full challenge with Harada Pro.',
  },
};

export const VALUE_PROPOSITION = 'Harada helps you turn ambitious goals into structured plans and consistent action.';

export const FREE_INCLUDES = [
  'One active goal',
  'The full matrix: 8 key areas, 64 actions',
  'Daily tracking of tasks and routines',
  'Daily reflection',
  'A basic progress card to share',
];

export const PRO_INCLUDES: { feature: Feature | null; text: string }[] = [
  { feature: 'multiple_goals', text: 'Multiple active goals' },
  { feature: 'advanced_reviews', text: 'Weekly and monthly reviews' },
  { feature: 'challenge', text: 'The 30-Day Challenge' },
  { feature: 'progress_history', text: 'Progress history and trends' },
  { feature: 'premium_templates', text: 'Premium example plans' },
  { feature: 'ai_planning', text: 'Planning suggestions for key areas and actions' },
  { feature: 'insights', text: 'Deeper insights by key area' },
];

export const RENEWAL_TERMS: Record<Price['interval'], string> = {
  month: 'Renews monthly until you cancel. Cancel anytime.',
  year: 'Renews yearly until you cancel. Cancel anytime.',
};

/** "October 26, 2026" for an ISO instant or a YYYY-MM-DD date. */
export function formatDay(iso: string): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export type PlanLine = { text: string; tone?: 'muted' | 'warning' | 'danger' };

/**
 * The plan exactly as get_my_plan reports it, in sentences. Never infers more than the server said:
 * a renewal date only when there is one, a warning only for the states Stripe reports.
 */
export function describePlan(plan: PlanInfo): { name: string; lines: PlanLine[] } {
  if (plan.plan === 'free') {
    return { name: 'Free', lines: [] };
  }
  const lines: PlanLine[] = [];
  const sub = plan.subscription;
  if (sub) {
    const cadence = sub.priceId === 'pro_annual' ? 'Billed yearly' : sub.priceId === 'pro_monthly' ? 'Billed monthly' : null;
    if (cadence) lines.push({ text: cadence, tone: 'muted' });
    const end = sub.currentPeriodEnd ? formatDay(sub.currentPeriodEnd) : null;
    if (sub.status === 'past_due' || sub.status === 'unpaid') {
      lines.push({
        text: 'Your last payment didn’t go through. Update your payment method in Billing to keep Pro.',
        tone: 'warning',
      });
    } else if (sub.cancelAtPeriodEnd) {
      lines.push({ text: end ? `Ends on ${end}. You keep Pro until then, and it won’t renew.` : 'Cancelled. It won’t renew.' });
    } else if (end) {
      lines.push({ text: `Renews on ${end}.` });
    }
  } else if (plan.grant) {
    lines.push({
      text: plan.grant.expiresAt ? `Complimentary access until ${formatDay(plan.grant.expiresAt)}.` : 'Complimentary access.',
    });
  }
  return { name: 'Harada Pro', lines };
}
