import { useLocalSearchParams } from 'expo-router';

import { UpgradeView } from '@/features/premium/UpgradeView';
import { parseFeature } from '@/features/premium/copy';

/** /upgrade?feature=<Feature>&note=<string>: Harada Pro screen; the feature that led here comes first. */
export default function UpgradeScreen() {
  const { feature, note } = useLocalSearchParams<{ feature?: string | string[]; note?: string | string[] }>();
  const noteStr = Array.isArray(note) ? note[0] : note;
  return <UpgradeView feature={parseFeature(feature)} note={noteStr || undefined} />;
}
