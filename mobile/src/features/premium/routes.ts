/**
 * Links to the premium routes. They are cast to Href because the generated typed-routes file
 * (.expo/types) is only refreshed by the dev server and may not list routes added since.
 */
import type { Href } from 'expo-router';

import type { Feature } from '@/data/premium';

export const upgradeHref = (feature?: Feature) => (feature ? `/upgrade?feature=${feature}` : '/upgrade') as Href;
export const insightsHref = (goalId: string) => `/insights?goalId=${encodeURIComponent(goalId)}` as Href;
export const shareHref = (goalId: string, kind: 'progress' | 'weekly' | 'challenge' = 'progress') =>
  `/share?goalId=${encodeURIComponent(goalId)}&kind=${kind}` as Href;
