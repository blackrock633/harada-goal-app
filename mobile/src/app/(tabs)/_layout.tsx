import { router, usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import { PAGES, SwipeLockProvider, pageIndexForPath, useSwipeLocked } from '@/ui/navigation';
import { useReduceMotion } from '@/ui';

/**
 * The four pages without a tab bar: swipe sideways between them (on a page's root screen), or open
 * the menu (header left). The dots at the bottom show where you are; they are not buttons.
 */
export default function PagesLayout() {
  return (
    <SwipeLockProvider>
      <Tabs style={styles.flex}>
        {/* Triggers register the routes; the bar itself is never shown. */}
        <TabList style={styles.hidden}>
          {PAGES.map((p) => (
            <TabTrigger key={p.name} name={p.name} href={p.href} />
          ))}
        </TabList>
        <SwipeablePages />
      </Tabs>
    </SwipeLockProvider>
  );
}

/** Horizontal distance (pt) or speed (pt/s) that turns a drag into a page change. */
const DISTANCE = 64;
const SPEED = 600;

function SwipeablePages() {
  const pathname = usePathname();
  const index = pageIndexForPath(pathname);
  const locked = useSwipeLocked();
  const reduceMotion = useReduceMotion();
  const offset = useRef(new Animated.Value(0)).current;
  const settle = () => {
    if (reduceMotion) offset.setValue(0);
    else Animated.timing(offset, { toValue: 0, duration: 180, useNativeDriver: true }).start();
  };

  const go = (to: number) => {
    const page = PAGES[to];
    if (page) router.navigate(page.href);
  };

  const pan = usePanGesture({
    runOnJS: true,
    enabled: index >= 0 && !locked,
    // Sideways only: a vertical scroll fails the gesture, so lists keep scrolling normally.
    activeOffsetX: [-24, 24],
    failOffsetY: [-14, 14],
    onUpdate: (e) => {
      // Follow the finger, damped, and resist at the first and last page.
      const atEdge = (e.translationX > 0 && index === 0) || (e.translationX < 0 && index === PAGES.length - 1);
      if (!reduceMotion) offset.setValue(e.translationX * (atEdge ? 0.15 : 0.35));
    },
    onDeactivate: (e) => {
      const next = e.translationX < -DISTANCE || e.velocityX < -SPEED ? index + 1 : e.translationX > DISTANCE || e.velocityX > SPEED ? index - 1 : index;
      settle();
      if (next !== index && next >= 0 && next < PAGES.length) go(next);
    },
    onFinalize: settle,
  });

  return (
    <View style={styles.flex}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.flex, { transform: [{ translateX: offset }] }]}>
          <TabSlot style={styles.flex} />
        </Animated.View>
      </GestureDetector>
      {index >= 0 ? <PageDots index={index} /> : null}
    </View>
  );
}

function PageDots({ index }: { index: number }) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${PAGES[index]!.label}, page ${index + 1} of ${PAGES.length}. Swipe left or right, or use the menu, to change page.`}
      pointerEvents="none"
      style={[styles.dots, { paddingBottom: Math.max(insets.bottom, space[2]), paddingTop: space[2], gap: space[2] }]}
    >
      {PAGES.map((p, i) => (
        <View
          key={p.name}
          style={{
            width: i === index ? 18 : 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: i === index ? colors.accent : colors.ruleStrong,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hidden: { display: 'none' },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
});
