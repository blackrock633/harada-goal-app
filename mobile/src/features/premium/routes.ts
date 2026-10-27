/**
 * Links to the premium routes. They are cast to Href because the generated typed-routes file
 * (.expo/types) is only refreshed by the dev server and may not list routes added since.
 */
import { router, type Href } from 'expo-router';

import type { Feature } from '@/data/premium';

export const upgradeHref = (feature?: Feature, note?: string) => {
  const params = new URLSearchParams();
  if (feature) params.set('feature', feature);
  if (note) params.set('note', note);
  const qs = params.toString();
  return (qs ? `/upgrade?${qs}` : '/upgrade') as Href;
};

/**
 * Push the full-screen Harada Pro upgrade route. Catches if called inside a standalone component
 * test that rendered without an Expo Router navigation container.
 */
export function openUpgrade(feature?: Feature, note?: string) {
  try {
    router.push(upgradeHref(feature, note));
  } catch {
    // Standalone component unit tests render without an Expo Router container.
  }
}

export const insightsHref = (goalId: string) => `/insights?goalId=${encodeURIComponent(goalId)}` as Href;
export const shareHref = (goalId: string, kind: 'progress' | 'weekly' | 'challenge' = 'progress') =>
  `/share?goalId=${encodeURIComponent(goalId)}&kind=${kind}` as Href;
