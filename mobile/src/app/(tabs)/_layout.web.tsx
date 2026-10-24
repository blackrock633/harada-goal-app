import { router } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MIN_TOUCH, useTheme } from '@/theme';
import { Icon, IconButton, Text, useLayout, type IconName } from '@/ui';

/**
 * Web shell. The native tab bar (NativeTabs) renders as a floating pill over the content on the
 * web, so the browser gets its own: a bottom bar on phone widths, a slim top bar when wide.
 * Route names match the native layout (_layout.tsx).
 */
const TABS: {
  name: string;
  href: '/today' | '/goal' | '/matrix' | '/review';
  label: string;
  icon: IconName;
}[] = [
  { name: 'today', href: '/today', label: 'Today', icon: 'today' },
  { name: 'goal', href: '/goal', label: 'My Goal', icon: 'goal' },
  { name: 'matrix', href: '/matrix', label: 'Matrix', icon: 'matrix' },
  { name: 'review', href: '/review', label: 'Review', icon: 'reflect' },
];

type WebTabProps = PressableProps & {
  isFocused?: boolean;
  label: string;
  icon: IconName;
  wide: boolean;
};

/** Receives isFocused / onPress / href from TabTrigger (asChild). */
function WebTab({ isFocused = false, label, icon, wide, ...rest }: WebTabProps) {
  const { colors, space } = useTheme();
  const [ring, setRing] = useState(false);
  const color = isFocused ? colors.accent : colors.inkMuted;
  return (
    <Pressable
      {...rest}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      onFocus={(e) => {
        // Ring for keyboard focus only, not for mouse clicks.
        const el = e.target as unknown as { matches?: (s: string) => boolean };
        setRing(el.matches?.(':focus-visible') ?? true);
      }}
      onBlur={() => setRing(false)}
      style={[
        wide ? styles.wideTab : styles.phoneTab,
        wide
          ? {
              paddingHorizontal: space[3],
              borderBottomWidth: 2,
              borderBottomColor: isFocused ? colors.accent : 'transparent',
            }
          : { gap: 2, paddingVertical: space[1] },
        ring
          ? {
              outlineWidth: 2,
              outlineStyle: 'solid',
              outlineColor: colors.focus,
              outlineOffset: -2,
            }
          : null,
      ]}
    >
      {wide ? null : (
        <Icon name={icon} size={22} color={color} weight={isFocused ? 'semibold' : 'regular'} />
      )}
      <Text
        variant={wide ? 'body' : 'caption'}
        weight={isFocused ? 'semibold' : 'medium'}
        style={{ color }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function WebTabsLayout() {
  const { colors, space, typeScale } = useTheme();
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();

  const triggers = TABS.map((t) => (
    <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
      <WebTab label={t.label} icon={t.icon} wide={wide} />
    </TabTrigger>
  ));

  return (
    <Tabs style={[styles.root, { backgroundColor: colors.paper }]}>
      {wide ? (
        // TabList must be a direct child of Tabs for its triggers to register and track focus.
        <TabList
          accessibilityRole="tablist"
          style={[
            styles.topBar,
            { borderBottomColor: colors.rule, paddingHorizontal: space[6], gap: space[2], backgroundColor: colors.paper },
          ]}
        >
          <Text style={[typeScale.heading, { color: colors.ink, marginRight: space[4] }]} accessibilityRole="header" aria-level={1}>
            Harada
          </Text>
          {triggers}
          <View style={styles.spacer} />
          <IconButton accessibilityLabel="Account menu" icon="account" tone="muted" onPress={() => router.push('/settings')} />
        </TabList>
      ) : null}
      <View style={styles.slot}>
        <TabSlot style={styles.slot} />
      </View>
      {wide ? null : (
        <TabList
          accessibilityRole="tablist"
          style={[
            styles.bottomBar,
            {
              backgroundColor: colors.paper,
              borderTopColor: colors.rule,
              paddingBottom: insets.bottom,
              paddingHorizontal: Math.max(insets.left, insets.right),
            },
          ]}
        >
          {triggers}
        </TabList>
      )}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  slot: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  spacer: { flex: 1 },
  topList: { flex: 1, flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'stretch', alignSelf: 'stretch', gap: 8 },
  wideTab: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  phoneTab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
});
