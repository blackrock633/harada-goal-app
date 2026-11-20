import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useRefreshPlan } from '@/data/premium';
import { Button, Section, Text } from '@/ui';
import {
  loadStorePackages,
  purchaseStorePackage,
  restoreStorePurchases,
  synchronizePurchases,
  type StorePackage,
} from './store';

export function StorePurchase({ manage = false, store }: { manage?: boolean; store?: string }) {
  const [packages, setPackages] = useState<StorePackage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useRefreshPlan();
  const terms=process.env.EXPO_PUBLIC_TERMS_URL;
  const privacy=process.env.EXPO_PUBLIC_PRIVACY_URL;
  const support=process.env.EXPO_PUBLIC_BILLING_SUPPORT_URL;
  const safeUrl=(s:string|undefined):s is string=>!!s && /^https:\/\/[^\s]+$/.test(s);
  const legalReady=safeUrl(terms) && safeUrl(privacy);
  const storeIsApple=store ? store==='app_store' : Platform.OS==='ios';
  const monthly=packages?.find(p=>p.packageType==='MONTHLY');

  async function load() {
    try {
      setPackages(await loadStorePackages());
    } catch {
      setMessage('Store purchases are unavailable. Check your connection or try again later.');
    }
  }
  useEffect(() => {
    if (!manage) void load();
  }, [manage]); // Store price, never the web price, is shown before purchase.
  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      await refresh();
      setMessage('Your plan has been refreshed from the server.');
    } catch (e) {
      if ((e as { userCancelled?: boolean })?.userCancelled) setMessage('Purchase cancelled.');
      else
        setMessage(
          e instanceof Error
            ? e.message
            : 'Store request failed. Please check your plan before trying again.',
        );
    } finally {
      setBusy(false);
    }
  }
  if (Platform.OS === 'web') return null;
  return (
    <Section title={manage ? 'Store subscription' : 'Choose your plan'}>
      {!manage && packages === null && !message ? <Text>Loading store prices…</Text> : null}
      {!manage &&
        packages?.map((pack) => (
          <View key={pack.identifier} style={{ gap: 8 }}>
            <Text variant="headline">
              {pack.packageType === 'ANNUAL' ? 'Annual' : 'Monthly'} · {pack.product.priceString}/
              {pack.packageType === 'ANNUAL' ? 'year' : 'month'}
            </Text>
            <Text variant="meta">
              Renews automatically each {pack.packageType === 'ANNUAL' ? 'year' : 'month'} until
              cancelled in your store subscription settings. No trial is offered here. The store
              confirms the total before purchase.
            </Text>
            {pack.packageType==='ANNUAL' && monthly && monthly.product.currencyCode===pack.product.currencyCode && monthly.product.price*12>pack.product.price ? <Text variant="meta">{new Intl.NumberFormat(undefined,{style:'currency',currency:pack.product.currencyCode}).format(monthly.product.price*12-pack.product.price)} less than 12 monthly payments.</Text>:null}
            <Button
              title={`Subscribe ${pack.packageType === 'ANNUAL' ? 'annually' : 'monthly'}`}
              disabled={busy || !legalReady}
              onPress={() => void run(() => purchaseStorePackage(pack))}
            />
          </View>
        ))}
      {!manage && packages?.length === 0 ? (
        <Text>No store plans are currently available. Free features remain available.</Text>
      ) : null}
      {!manage && !packages ? (
        <Button
          title="Reload store plans"
          variant="secondary"
          disabled={busy}
          onPress={() => void load()}
        />
      ) : null}
      <Button
        title="Restore purchases"
        variant="secondary"
        disabled={busy}
        onPress={() => void run(restoreStorePurchases)}
      />
      <Button
        title="Check my plan"
        variant="secondary"
        disabled={busy}
        onPress={() => void run(synchronizePurchases)}
      />
      {manage ? (
        <Button
          title="Manage store subscription"
          variant="secondary"
          disabled={busy}
          onPress={() =>
            void run(() =>
              Linking.openURL(
                storeIsApple
                  ? 'https://apps.apple.com/account/subscriptions'
                  : 'https://play.google.com/store/account/subscriptions',
              ),
            )
          }
        />
      ) : null}
      {!manage && !legalReady ? <Text>New store subscriptions are not available yet. Free features remain available.</Text>:null}
      {[[terms,'Terms of use'],[privacy,'Privacy policy'],[support,'Billing support']].map(([url,label])=>safeUrl(url)?<Button key={label} title={label!} variant="ghost" onPress={()=>void Linking.openURL(url)}/>:null)}
      {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
      <Text variant="caption">
        Payment is handled by {Platform.OS === 'ios' ? 'Apple' : 'Google Play'}. Cancellation
        preserves your Harada data. Restore purchases using the store account that made the
        purchase.
      </Text>
    </Section>
  );
}
