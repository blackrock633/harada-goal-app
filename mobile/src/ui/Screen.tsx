import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONTENT_MAX_WIDTH, useTheme } from '@/theme';

export type ScreenProps = {
  children: ReactNode;
  /** Pinned below the scroll area and kept above the keyboard (e.g. a Save button). */
  footer?: ReactNode;
  /** Offset for headers that overlap the content, if any. */
  keyboardVerticalOffset?: number;
  /** Pull-to-refresh: shown only when `onRefresh` is given. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Widest the content column gets on tablet / desktop. `full` lets a screen lay out its own wide grid. */
  maxWidth?: number | 'full';
};

/**
 * Safe-area aware scrolling screen.
 *
 * Keyboard handling follows https://docs.expo.dev/guides/keyboard-handling.md: the built-in
 * KeyboardAvoidingView (`padding` on iOS; Android resizes the window, the Expo default
 * softwareKeyboardLayoutMode). `keyboardShouldPersistTaps="handled"` keeps the first tap on a
 * button from being swallowed by keyboard dismissal. This needs no native module, so it also
 * works in Expo Go.
 */
export function Screen({ children, footer, keyboardVerticalOffset = 0, refreshing = false, onRefresh, maxWidth = CONTENT_MAX_WIDTH }: ScreenProps) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={[styles.flex, { backgroundColor: colors.paper }]}
    >
      <ScrollView
        testID="screen-scroll"
        style={styles.flex}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} /> : undefined
        }
        contentContainerStyle={{
          paddingHorizontal: space[4] + Math.max(insets.left, insets.right),
          paddingTop: space[4],
          paddingBottom: footer ? space[4] : space[10] + insets.bottom,
          flexGrow: 1,
        }}
      >
        <View style={[styles.column, { gap: space[4], maxWidth: maxWidth === 'full' ? undefined : maxWidth }]}>{children}</View>
      </ScrollView>
      {footer ? (
        <View
          style={{
            paddingHorizontal: space[4] + Math.max(insets.left, insets.right),
            paddingTop: space[3],
            paddingBottom: space[3] + insets.bottom,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.rule,
            backgroundColor: colors.paper,
          }}
        >
          <View style={[styles.column, { maxWidth: maxWidth === 'full' ? undefined : maxWidth }]}>{footer}</View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, column: { width: '100%', alignSelf: 'center', flexGrow: 1 } });
