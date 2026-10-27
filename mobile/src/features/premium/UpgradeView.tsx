import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatPrice, track, usePlan, usePrices, type Feature, type PlanInfo, type Price } from '@/data/premium';
import { ErrorScreen, LoadingScreen, SkeletonLines } from '@/screens/queryState';
import { useTheme } from '@/theme';
import { Button, Icon, Screen, Section, SegmentedControl, Text } from '@/ui';

import { useBillingPortal, useCheckout } from './billing';
import { FEATURE_COPY, FREE_INCLUDES, PRO_INCLUDES, RENEWAL_TERMS, VALUE_PROPOSITION, describePlan } from './copy';

export type UpgradeViewProps = {
  /** The feature that brought the user here (from ?feature=), shown first. */
  feature?: Feature;
  /** Optional contextual note explaining why the user was brought here. */
  note?: string;
};

const INTERVALS = [
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
] as const;

/**
 * What Harada Pro is, what it costs and how it renews, or, for a Pro user, the plan's state and the
 * way to Billing. Prices come from the database; the plan shown is always the server's.
 */
export function UpgradeView({ feature, note }: UpgradeViewProps) {
  const plan = usePlan();

  useEffect(() => {
    track('upgrade_page_viewed', { feature: feature ?? 'none' });
  }, [feature]);

  if (plan.isPending) return <LoadingScreen label="Loading your plan" />;
  if (!plan.data) return <ErrorScreen error={plan.error} onRetry={() => void plan.refetch()} />;

  return (
    <Screen refreshing={plan.isRefetching} onRefresh={() => void plan.refetch()}>
      {plan.data.plan === 'pro' ? <ProStatus plan={plan.data} /> : <FreeOffer feature={feature} note={note} />}
    </Screen>
  );
}

function FreeOffer({ feature, note }: { feature?: Feature; note?: string }) {
  const { space } = useTheme();
  const focus = feature ? FEATURE_COPY[feature] : null;
  return (
    <View style={{ gap: space[6] }}>
      <View style={{ gap: space[2] }}>
        <Text variant="title" accessibilityRole="header">
          Harada Pro
        </Text>
        <Text>{VALUE_PROPOSITION}</Text>
        <Text tone="muted">Pro adds room for more goals and a longer view of what you have done.</Text>
      </View>

      {focus ? (
        <View style={{ gap: space[1] }} testID="upgrade-focus">
          {note ? (
            <Text variant="meta" tone="muted">
              {note}
            </Text>
          ) : null}
          <Text variant="headline">{focus.title}</Text>
          <Text variant="meta" tone="muted">
            {focus.body}
          </Text>
        </View>
      ) : null}

      <Section title="Free" description="Included for everyone, with no time limit.">
        <Checklist items={FREE_INCLUDES.map((text) => ({ text }))} />
      </Section>
      <Section title="Harada Pro" description="Everything in Free, plus:">
        <Checklist items={PRO_INCLUDES.map((p) => ({ text: p.text, strong: p.feature === feature }))} />
      </Section>

      <Purchase />
    </View>
  );
}

function Purchase() {
  const { space } = useTheme();
  const prices = usePrices();
  const plan = usePlan();
  const checkout = useCheckout();
  const [interval, setInterval] = useState<Price['interval']>('month');

  if (prices.isPending) {
    return (
      <Section title="Price">
        <SkeletonLines label="Loading prices" widths={['55%', '75%']} />
      </Section>
    );
  }
  if (prices.isError && !prices.data) {
    return (
      <Section title="Price">
        <Text tone="danger" accessibilityRole="alert">
          Couldn’t load prices. Check your connection and try again.
        </Text>
        <View style={{ alignItems: 'flex-start' }}>
          <Button title="Try again" variant="secondary" onPress={() => void prices.refetch()} />
        </View>
      </Section>
    );
  }
  const monthly = prices.data?.find((p) => p.interval === 'month');
  const yearly = prices.data?.find((p) => p.interval === 'year');
  if (!monthly && !yearly) {
    return (
      <Section title="Price">
        <Text tone="muted">Upgrades aren’t available yet. Everything in Free keeps working.</Text>
      </Section>
    );
  }
  const options = INTERVALS.filter((o) => (o.value === 'month' ? monthly : yearly));
  const chosen = (interval === 'year' ? yearly : monthly) ?? monthly ?? yearly!;

  return (
    <Section title="Price">
      {options.length > 1 ? (
        <SegmentedControl
          label="Billing period"
          options={options}
          value={chosen.interval}
          onChange={(v) => {
            if (!checkout.busy) setInterval(v);
          }}
        />
      ) : null}
      <View style={{ gap: space[1] }} testID="upgrade-price">
        <Text variant="title" tabular>
          {`${formatPrice(chosen.amountCents, chosen.currency)} ${chosen.interval === 'year' ? 'per year' : 'per month'}`}
        </Text>
        {chosen.interval === 'year' && monthly ? <YearlyComparison yearly={chosen} monthly={monthly} /> : null}
      </View>
      <Text variant="meta" tone="muted">
        {RENEWAL_TERMS[chosen.interval]}
      </Text>
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          title="Continue to payment"
          loading={checkout.busy}
          accessibilityLabel={`Continue to payment, ${formatPrice(chosen.amountCents, chosen.currency)} ${chosen.interval === 'year' ? 'per year' : 'per month'}`}
          onPress={() => void checkout.start(chosen.id)}
        />
      </View>
      {checkout.error ? (
        <Text tone="danger" accessibilityRole="alert">
          {checkout.error}
        </Text>
      ) : null}
      {checkout.returned && plan.data?.plan !== 'pro' ? (
        <View style={{ gap: space[2] }} accessibilityLiveRegion="polite">
          <Text>Your plan updates as soon as Stripe confirms the payment. If you didn’t finish paying, nothing was charged.</Text>
          <View style={{ alignItems: 'flex-start' }}>
            <Button title="Check my plan" variant="secondary" size="compact" onPress={() => void checkout.refreshPlan()} />
          </View>
        </View>
      ) : null}
      <Text variant="caption" tone="muted">
        Payment happens on Stripe’s checkout page in your browser, not through the App Store or Google Play.
        Harada never sees your card details.
      </Text>
    </Section>
  );
}

/** The yearly price in monthly terms, computed from the two prices. Only a real difference is stated. */
export function yearlyComparison(yearly: Price, monthly: Price): { perMonth: string; saving: string | null } {
  const perMonth = formatPrice(Math.round(yearly.amountCents / 12), yearly.currency);
  const diff = monthly.amountCents * 12 - yearly.amountCents;
  return { perMonth, saving: diff > 0 && monthly.currency === yearly.currency ? formatPrice(diff, yearly.currency) : null };
}

function YearlyComparison({ yearly, monthly }: { yearly: Price; monthly: Price }) {
  const { perMonth, saving } = yearlyComparison(yearly, monthly);
  return (
    <Text variant="meta" tone="muted" tabular>
      {saving
        ? `Equal to ${perMonth} a month: ${saving} less than 12 months at ${formatPrice(monthly.amountCents, monthly.currency)}.`
        : `Equal to ${perMonth} a month.`}
    </Text>
  );
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
          <Text variant="meta" tone="muted">
            Change your payment method, see invoices, switch between monthly and yearly, or cancel, on Stripe’s billing page.
          </Text>
          {portal.error ? (
            <Text tone="danger" accessibilityRole="alert">
              {portal.error}
            </Text>
          ) : null}
          {portal.returned ? (
            <Text variant="meta" accessibilityLiveRegion="polite">
              Changes you made in Billing show here once Stripe confirms them.
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
