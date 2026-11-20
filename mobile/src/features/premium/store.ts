/** Narrow SDK boundary. The native package loads only when a store operation is requested. */
import { Platform } from 'react-native';
import { getSupabase } from '@/data/supabase';
import { invokeFunction } from '@/data/premium';

export interface StorePackage {
  identifier: string;
  packageType: string;
  product: { identifier: string; priceString: string; price: number; currencyCode: string };
}
interface PurchasesSDK {
  configure(config: { apiKey: string; appUserID: string }): void;
  logIn(id: string): Promise<unknown>;
  getAppUserID(): Promise<string>;
  getOfferings(): Promise<{ current: { availablePackages: StorePackage[] } | null }>;
  purchasePackage(pack: StorePackage): Promise<unknown>;
  restorePurchases(): Promise<unknown>;
}
let configured = false;
let busy = false;
async function sdk(): Promise<{ purchases: PurchasesSDK; user: string }> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android')
    throw new Error('Use web billing on this platform.');
  const apiKey =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  if (!apiKey)
    throw new Error('Store purchases are not configured yet. Everything in Free keeps working.');
  const { data, error } = await getSupabase().auth.getUser();
  if (error || !data.user) throw new Error('Sign in before using store billing.');
  const identity = await getSupabase().rpc('my_billing_identity');
  if (identity.error || typeof identity.data !== 'string')
    throw new Error('Could not verify billing identity.');
  const appUserID = identity.data;
  // Lazy load also provides an honest unavailable state in Expo Go. No mock purchase fallback.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Avoid loading a native module before platform/config checks.
  const purchases = (require('react-native-purchases') as { default: PurchasesSDK }).default;
  if (!configured) {
    purchases.configure({ apiKey, appUserID });
    configured = true;
  } else if ((await purchases.getAppUserID()) !== appUserID) await purchases.logIn(appUserID);
  return { purchases, user: data.user.id };
}
async function operation<T>(fn: (p: PurchasesSDK) => Promise<T>): Promise<T> {
  if (busy) throw new Error('A store operation is already in progress.');
  busy = true;
  try {
    const { purchases } = await sdk();
    return await fn(purchases);
  } finally {
    busy = false;
  }
}
export const loadStorePackages = () =>
  operation(
    async (p) =>
      (await p.getOfferings()).current?.availablePackages.filter((x) =>
        ['MONTHLY', 'ANNUAL'].includes(x.packageType),
      ) ?? [],
  );
export async function synchronizePurchases() {
  const result = await invokeFunction<{ synchronized: boolean }>('billing-sync', {});
  if (!result.ok)
    throw new Error(
      'Your purchase is awaiting server verification. Check your plan again shortly.',
    );
}
export async function purchaseStorePackage(pack: StorePackage) {
  await operation(async (p) => {
    const { data, error } = await getSupabase().rpc('get_my_plan');
    if (error) throw new Error('Could not check your plan. Try again.');
    if (
      data?.plan === 'pro' ||
      (data?.subscription &&
        ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'].includes(
          data.subscription.status,
        ))
    )
      throw new Error(
        'You already have a subscription or complimentary Pro. Manage your existing plan.',
      );
    await p.purchasePackage(pack);
    await synchronizePurchases();
  });
}
export const restoreStorePurchases = () =>
  operation(async (p) => {
    await p.restorePurchases();
    await synchronizePurchases();
  });
