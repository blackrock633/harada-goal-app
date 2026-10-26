import { isBillingFailureCode } from '@/application/web-public';

/**
 * Fixed wording for billing failures, keyed by the code in ?error=. The query value is only ever used as a key,
 * so nothing from the URL is echoed into the page.
 */
const CHECKOUT: Record<string, string> = {
  NOT_CONFIGURED: "Upgrades aren't available yet. Nothing was charged.",
  CONFLICT: 'You already have Harada Pro. Manage or change it from Billing.',
  VALIDATION: 'Choose monthly or annual billing, then try again. Nothing was charged.',
  UNAVAILABLE: "Couldn't reach the payment provider. Nothing was charged — please try again.",
  INTERNAL: 'Something went wrong before checkout opened. Nothing was charged — please try again.',
  UNAUTHENTICATED: 'Sign in to upgrade. Nothing was charged.',
};

const PORTAL: Record<string, string> = {
  NOT_CONFIGURED: "Billing isn't available yet.",
  CONFLICT: 'There is no billing account yet. Upgrade first to manage billing.',
  VALIDATION: 'Something went wrong. Please try again.',
  UNAVAILABLE: "Couldn't reach the payment provider. Please try again.",
  INTERNAL: 'Something went wrong. Please try again.',
  UNAUTHENTICATED: 'Sign in to manage billing.',
};

export function billingErrorMessage(code: unknown, kind: 'checkout' | 'portal'): string | null {
  const c = Array.isArray(code) ? code[0] : code;
  if (!isBillingFailureCode(c)) return null;
  return (kind === 'checkout' ? CHECKOUT : PORTAL)[c] ?? null;
}
