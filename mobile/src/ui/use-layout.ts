import { useWindowDimensions } from 'react-native';

import { CONTENT_MAX_WIDTH, WIDE_BREAKPOINT } from '@/theme';

/** Phone vs wide (tablet, desktop web). Layout changes structure at the breakpoint, not just width. */
export function useLayout() {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  return { width, wide, contentWidth: Math.min(width, CONTENT_MAX_WIDTH) };
}
