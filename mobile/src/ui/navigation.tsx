import { router, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { IconButton } from './IconButton';
import type { IconName } from './Icon';

/** The four swipeable pages, in swipe order. Routes match `(tabs)/<name>`. */
export const PAGES: { name: 'today' | 'goal' | 'matrix' | 'review'; href: '/today' | '/goal' | '/matrix' | '/review'; label: string; icon: IconName }[] = [
  { name: 'today', href: '/today', label: 'Today', icon: 'today' },
  { name: 'goal', href: '/goal', label: 'My Goal', icon: 'goal' },
  { name: 'matrix', href: '/matrix', label: 'Matrix', icon: 'matrix' },
  { name: 'review', href: '/review', label: 'Review', icon: 'reflect' },
];

/** Index of the page whose ROOT screen is showing, or -1 (a sub-screen, or not a page). */
export function pageIndexForPath(pathname: string): number {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return PAGES.findIndex((p) => p.href === clean);
}

/**
 * Swiping between pages must not fight a view that pans sideways itself (the zoomable full sheet).
 * Such a view calls `useSwipeLock(true)` while it is on screen.
 */
const SwipeLock = createContext<{ locked: boolean; lock: () => () => void }>({ locked: false, lock: () => () => {} });

export function SwipeLockProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const lock = useCallback(() => {
    setCount((c) => c + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setCount((c) => c - 1);
    };
  }, []);
  const value = useMemo(() => ({ locked: count > 0, lock }), [count, lock]);
  return <SwipeLock.Provider value={value}>{children}</SwipeLock.Provider>;
}

export const useSwipeLocked = () => useContext(SwipeLock).locked;

export function useSwipeLock(active: boolean) {
  const { lock } = useContext(SwipeLock);
  const release = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!active) return;
    release.current = lock();
    return () => release.current?.();
  }, [active, lock]);
}

/** Header-left control on every page: opens the app menu. */
export function MenuButton() {
  return <IconButton accessibilityLabel="Menu" icon="menu" tone="muted" onPress={() => router.push('/menu' as Href)} />;
}
