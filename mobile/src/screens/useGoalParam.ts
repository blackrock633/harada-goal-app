import { useLocalSearchParams } from 'expo-router';

/** The `?goal=<id>` search param (undefined when absent). */
export function useGoalParam(): string | undefined {
  const { goal } = useLocalSearchParams<{ goal?: string | string[] }>();
  const value = Array.isArray(goal) ? goal[0] : goal;
  return value || undefined;
}
