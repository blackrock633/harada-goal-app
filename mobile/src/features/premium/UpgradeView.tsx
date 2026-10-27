import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatPrice, track, usePlan, usePrices, type Feature, type PlanInfo, type Price } from '@/data/premium';
import { SkeletonLines } from '@/screens/queryState';
import { useTheme } from '@/theme';
import { Button, HaradaMark, Icon, Screen, Section, Text } from '@/ui';

import { useBillingPortal, useCheckout } from './billing';
import { FEATURE_COPY, PRO_INCLUDES, RENEWAL_TERMS, describePlan } from './copy';

export type UpgradeViewProps = {
  /** The feature that brought the user here (from ?feature=), shown first. */
  feature?: Feature;
  /** Optional contextual note explaining why the user was brought here. */
  note?: string;
};

/**
 * The paywall: what Harada Pro adds, the two plans and one button to pay. For a Pro user, the plan's
 * state and the way to Billing. Prices come from the database; the plan shown is always the server's.
 */
export function UpgradeView({ feature, note }: UpgradeViewProps) {
  return (
    <Screen>
      <Paywall feature={feature} note={note} />
    </Screen>
  );
}

/** The paywall content, also shown in place of a locked screen. */
export function Paywall({ feature, note }: UpgradeViewProps) {
  const plan = usePlan();

  useEffect(() => {
    track('upgrade_page_viewed', { feature: feature ?? 'none' });
  }, [feature]);

  if (plan.isPending) return <SkeletonLines label="Loading your plan" widths={['60%', '80%', '45%']} />;
  if (!plan.data) {
    return (
      <View style={{ gap: 12 }}>
        <Text tone="danger" accessibilityRole="alert">
          Couldn’t load your plan. Check your connection and try again.
        </Text>
        <View style={{ alignItems: 'flex-start' }}>
          <Button title="Try again" variant="secondary" onPress={() => void plan.refetch()} />
        </View>
      </View>
    );
  }
  return plan.data.plan === 'pro' ? <ProStatus plan={plan.data} /> : <FreeOffer feature={feature} note={note} />;
}

function FreeOffer({ feature, note }: { feature?: Feature; note?: string }) {
  const { space } = useTheme();
  const headline = feature ? FEATURE_COPY[feature].title : 'Go further with Harada Pro';
  return (
    <View style={{ gap: space[6] }} testID="paywall">
      <View style={{ alignItems: 'center', gap: space[3], paddingTop: space[2] }}>
        <HaradaMark size={48} />
        <Text variant="caption" weight="semibold" tone="muted">
          HARADA PRO
        </Text>
        <Text variant="title" accessibilityRole="header" style={{ textAlign: 'center' }} testID="upgrade-focus">
          {headline}
        </Text>
        {note ? (
          <Text variant="meta" tone="muted" style={{ textAlign: 'center' }}>
            {note}
          </Text>
        ) : null}
      </View>
      <Checklist items={PRO_INCLUDES.map((p) => ({ text: p.text, strong: p.feature === feature }))} />
      <Purchase />
    </View>
  );
}

function Purchase() {
  const { space } = useTheme();
  const prices = usePrices();
  const plan = usePlan();
  const checkout = useCheckout();
  const [interval, setInterval] = useState<Price['interval']>('year');

  if (prices.isPending) return <SkeletonLines label="Loading prices" widths={['100%', '100%', '70%']} />;
  if (prices.isError && !prices.data) {
    return (
      <View style={{ gap: space[2] }}>
        <Text tone="danger" accessibilityRole="alert">
          Couldn’t load prices. Check your connection and try again.
        </Text>
        <View style={{ alignItems: 'flex-start' }}>
          <Button title="Try again" variant="secondary" onPress={() => void prices.refetch()} />
        </View>
      </View>
    );
  }
  const monthly = prices.data?.find((p) => p.interval === 'month');
  const yearly = prices.data?.find((p) => p.interval === 'year');
  if (!monthly && !yearly) return <Text tone="muted">Upgrades aren’t available yet.</Text>;
  const chosen = (interval === 'year' ? yearly : monthly) ?? monthly ?? yearly!;
  const priceText = (p: Price) => `${formatPrice(p.amountCents, p.currency)} ${p.interval === 'year' ? 'per year' : 'per month'}`;

  return (
    <View style={{ gap: space[4] }}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Billing period" style={{ gap: space[2] }}>
        {yearly ? (
          <PlanOption
            selected={chosen.interval === 'year'}
            title="Yearly"
            price={priceText(yearly)}
            detail={monthly ? yearlyDetail(yearly, monthly) : null}
            onPress={() => !checkout.busy && setInterval('year')}
          />
        ) : null}
        {monthly ? (
          <PlanOption
            selected={chosen.interval === 'month'}
            title="Monthly"
            price={priceText(monthly)}
            detail={null}
            onPress={() => !checkout.busy && setInterval('month')}
          />
        ) : null}
      </View>
      <View testID="upgrade-price" style={{ gap: space[2] }}>
        <Button
          title="Continue"
          loading={checkout.busy}
          accessibilityLabel={`Continue to payment, ${priceText(chosen)}`}
          onPress={() => void checkout.start(chosen.id)}
        />
        <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
          {RENEWAL_TERMS[chosen.interval]}
        </Text>
      </View>
      {checkout.error ? (
        <Text tone="danger" accessibilityRole="alert">
          {checkout.error}
        </Text>
      ) : null}
      {checkout.returned && plan.data?.plan !== 'pro' ? (
        <View style={{ gap: space[2] }} accessibilityLiveRegion="polite">
          <Text>Your plan updates once Stripe confirms the payment.</Text>
          <View style={{ alignItems: 'flex-start' }}>
            <Button title="Check my plan" variant="secondary" size="compact" onPress={() => void checkout.refreshPlan()} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PlanOption({ selected, title, price, detail, onPress }: { selected: boolean; title: string; price: string; detail: string | null; onPress: () => void }) {
  const { colors, space, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}, ${price}${detail ? `, ${detail}` : ''}`}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        padding: space[4],
        borderRadius: radius.md,
        borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
        borderColor: selected ? colors.accent : colors.ruleStrong,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline">{title}</Text>
        {detail ? (
          <Text variant="caption" tone="muted" tabular>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text variant="body" weight="semibold" tabular>
        {price}
      </Text>
    </Pressable>
  );
}

/** The yearly price in monthly terms, computed from the two prices. Only a real difference is stated. */
export function yearlyComparison(yearly: Price, monthly: Price): { perMonth: string; saving: string | null } {
  const perMonth = formatPrice(Math.round(yearly.amountCents / 12), yearly.currency);
  const diff = monthly.amountCents * 12 - yearly.amountCents;
  return { perMonth, saving: diff > 0 && monthly.currency === yearly.currency ? formatPrice(diff, yearly.currency) : null };
}

/** "$4.17 a month · $45.89 less than monthly": computed from the two prices; only a real difference is stated. */
function yearlyDetail(yearly: Price, monthly: Price): string {
  const { perMonth, saving } = yearlyComparison(yearly, monthly);
  return saving ? `${perMonth} a month · ${saving} less than monthly` : `${perMonth} a month`;
}

function ProStatus({ plan }: { plan: PlanInfo }) {
  const { space } = useTheme();
  const portal = useBillingPortal();
  const { lines } = describePlan(plan);
  const canManage = !!plan.subscription?.hasBillingAccount;
  return (
    <View style={{ gap: space[6] }}>
      <View style={{ gap: space[2] }}>
        <Text variant="title" accessibilityRole="header">
          You have Harada Pro
        </Text>
        {lines.map((l) => (
          <Text key={l.text} tone={l.tone ?? 'default'} accessibilityRole={l.tone === 'warning' ? 'alert' : undefined}>
            {l.text}
          </Text>
        ))}
      </View>
      {canManage ? (
        <View style={{ gap: space[2] }}>
          <View style={{ alignItems: 'flex-start' }}>
            <Button title="Manage billing" loading={portal.busy} onPress={() => void portal.open()} />
          </View>
          {portal.error ? (
            <Text tone="danger" accessibilityRole="alert">
              {portal.error}
            </Text>
          ) : null}
          {portal.returned ? (
            <Text variant="meta" accessibilityLiveRegion="polite">
              Changes show here once Stripe confirms them.
            </Text>
          ) : null}
        </View>
      ) : null}
      <Section title="Included in your plan">
        <Checklist items={PRO_INCLUDES.map((p) => ({ text: p.text }))} />
      </Section>
    </View>
  );
}

function Checklist({ items }: { items: { text: string; strong?: boolean }[] }) {
  const { colors, space } = useTheme();
  return (
    <View>
      {items.map((it, i) => (
        <View
          key={it.text}
          style={[
            styles.item,
            {
              gap: space[3],
              paddingVertical: space[2],
              borderBottomWidth: i < items.length - 1 ? StyleSheet.hairlineWidth : 0,
              borderBottomColor: colors.rule,
            },
          ]}
        >
          <Icon name="check" size={16} color={colors.inkMuted} style={{ marginTop: 4 }} />
          <Text variant="body" weight={it.strong ? 'semibold' : undefined} style={styles.itemText}>
            {it.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'flex-start' },
  itemText: { flex: 1, flexShrink: 1 },
});
