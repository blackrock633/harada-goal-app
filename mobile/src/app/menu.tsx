import { router, usePathname, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { hasFeature, usePlan, type Feature } from '@/data/premium';
import { MIN_TOUCH, useTheme } from '@/theme';
import { Badge, Icon, Screen, Text, type IconName } from '@/ui';
import { PAGES } from '@/ui/navigation';

type Item = { label: string; icon: IconName; href: Href; pro?: Feature };

const MORE: Item[] = [
  { label: 'Community', icon: 'community', href: '/community' },
  { label: 'Your profile', icon: 'account', href: '/community/u/me' as Href },
  { label: '30-Day Challenge', icon: 'challenge', href: '/challenge', pro: 'challenge' as Feature },
  { label: 'Progress history', icon: 'history', href: '/insights', pro: 'progress_history' },
  { label: 'Share progress', icon: 'share', href: '/share' },
  { label: 'Harada Pro', icon: 'pro', href: '/upgrade' },
  { label: 'Settings', icon: 'settings', href: '/settings' },
];

/** The app menu (header left on every page): the four pages, then everything else. */
export default function MenuScreen() {
  const { space } = useTheme();
  const plan = usePlan();
  // The menu is presented over the pages, so the path underneath is the current page.
  const pathname = usePathname();

  const open = (href: Href, replaceMenu: boolean) => {
    if (replaceMenu) {
      router.back();
      router.navigate(href);
    } else {
      router.replace(href);
    }
  };

  return (
    <Screen>
      <View accessibilityRole="menu" style={{ gap: space[1] }}>
        {PAGES.map((p) => (
          <Row
            key={p.name}
            label={p.label}
            icon={p.icon}
            current={pathname.startsWith(p.href)}
            onPress={() => open(p.href, true)}
          />
        ))}
      </View>
      <View style={{ gap: space[1] }}>
        {MORE.map((m) => (
          <Row
            key={m.label}
            label={m.label}
            icon={m.icon}
            locked={!!m.pro && !!plan.data && !hasFeature(plan.data, m.pro)}
            onPress={() => open(m.href, false)}
          />
        ))}
      </View>
    </Screen>
  );
}

function Row({ label, icon, current = false, locked = false, onPress }: { label: string; icon: IconName; current?: boolean; locked?: boolean; onPress: () => void }) {
  const { colors, space, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={locked ? `${label}, Harada Pro` : label}
      accessibilityState={{ selected: current }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          gap: space[3],
          paddingHorizontal: space[3],
          borderRadius: radius.md,
          backgroundColor: pressed || current ? colors.surfaceSunken : 'transparent',
        },
      ]}
    >
      <Icon name={icon} size={22} color={current ? colors.accent : colors.inkMuted} weight={current ? 'semibold' : 'regular'} />
      <Text variant="headline" weight={current ? 'semibold' : undefined} style={styles.label}>
        {label}
      </Text>
      {locked ? <Badge text="Pro" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH + 8 },
  label: { flex: 1 },
});
