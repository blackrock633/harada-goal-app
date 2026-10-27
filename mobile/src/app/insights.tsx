import { useLocalSearchParams } from 'expo-router';

import { HistoryScreen } from '@/features/premium/HistoryScreen';

/** /insights?goalId=<id>: progress history (Harada Pro). Without goalId, the default goal. */
export default function InsightsScreen() {
  const { goalId } = useLocalSearchParams<{ goalId?: string | string[] }>();
  return <HistoryScreen goalId={(Array.isArray(goalId) ? goalId[0] : goalId) || undefined} />;
}
