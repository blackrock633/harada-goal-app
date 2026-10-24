import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** True when the user asked the OS to reduce motion (iOS Reduce Motion, Android Remove animations). */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((on) => active && setReduce(on))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduce);
    return () => {
      active = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}
