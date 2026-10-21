import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

/**
 * Like ui/Screen (same keyboard + safe-area handling) but with pull-to-refresh. Used by route
 * screens that list data; ui/Screen has no refresh hook and src/ui is not edited from the routes.
 */
export function RefreshScreen({
  children,
  refreshing = false,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: colors.paper }]}
    >
      <ScrollView
        testID="screen-scroll"
        style={styles.flex}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
        contentContainerStyle={{
          paddingHorizontal: space[4] + Math.max(insets.left, insets.right),
          paddingTop: space[4],
          paddingBottom: space[8] + insets.bottom,
          gap: space[4],
          flexGrow: 1,
        }}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
