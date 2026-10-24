import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme } from '@/theme';

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <NativeTabs tintColor={colors.accent}>
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'checkmark.circle', selected: 'checkmark.circle.fill' }} md="check_circle" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="goal">
        <NativeTabs.Trigger.Label>My Goal</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="target" md="flag" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="matrix">
        <NativeTabs.Trigger.Label>Matrix</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="square.grid.3x3" md="grid_view" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="review">
        <NativeTabs.Trigger.Label>Review</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="book" md="menu_book" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
