import { router } from 'expo-router';
import { View } from 'react-native';

import { usePlan } from '@/data/premium';
import { messageFor } from '@/screens/queryState';
import { useTheme } from '@/theme';
import { Button, ListRow, Section, Text } from '@/ui';

import { useBillingPortal } from './billing';
import { OverLimitNotice } from './ChooseActiveGoal';
import { describePlan } from './copy';
import { upgradeHref } from './routes';

/** Settings: the plan as the server reports it, and the one next step (upgrade or Billing). */
export function PlanSection() {
  const { space } = useTheme();
  const plan = usePlan();
  const portal = useBillingPortal();

  if (plan.isPending) {
    return (
      <Section title="Plan & billing">
        <Text tone="muted" accessibilityRole="progressbar">
          Loading your plan…
        </Text>
      </Section>
    );
  }
  if (!plan.data) {
    return (
      <Section title="Plan & billing">
        <Text tone="danger" accessibilityRole="alert">
          {`Couldn’t load your plan. ${messageFor(plan.error)}`}
        </Text>
        <View style={{ alignItems: 'flex-start' }}>
          <Button title="Try again" variant="secondary" size="compact" onPress={() => void plan.refetch()} />
        </View>
      </Section>
    );
  }

  const p = plan.data;
  const { name, lines } = describePlan(p);
  const canManage = !!p.subscription?.hasBillingAccount;
  return (
    <Section title="Plan & billing">
      <View>
        <ListRow title="Plan" meta={name} divider={lines.length > 0} />
        {lines.map((l, i) => (
          <Text
            key={l.text}
            variant="meta"
            tone={l.tone ?? 'default'}
            accessibilityRole={l.tone === 'warning' ? 'alert' : undefined}
            style={{ paddingTop: i === 0 ? space[2] : 0 }}
          >
            {l.text}
          </Text>
        ))}
      </View>
      <OverLimitNotice plan={p} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {p.plan === 'free' ? (
          <Button title="See Harada Pro" variant="secondary" onPress={() => router.push(upgradeHref())} />
        ) : null}
        {canManage ? (
          <Button title="Manage billing" variant="secondary" loading={portal.busy} onPress={() => void portal.open()} />
        ) : null}
      </View>
      {portal.error ? (
        <Text variant="meta" tone="danger" accessibilityRole="alert">
          {portal.error}
        </Text>
      ) : null}
      {portal.returned ? (
        <Text variant="meta" tone="muted" accessibilityLiveRegion="polite">
          Changes you made in Billing show here once Stripe confirms them.
        </Text>
      ) : null}
    </Section>
  );
}
