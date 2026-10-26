import { useLocalSearchParams } from 'expo-router';

import { UpgradeView } from '@/features/premium/UpgradeView';
import { parseFeature } from '@/features/premium/copy';

/** /upgrade?feature=<Feature>: Harada Pro, opened as a modal; the feature that led here comes first. */
export default function UpgradeScreen() {
  const { feature } = useLocalSearchParams<{ feature?: string | string[] }>();
  return <UpgradeView feature={parseFeature(feature)} />;
}
