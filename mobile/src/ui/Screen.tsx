import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

export type ScreenProps = {
  children: ReactNode;
  /** Pinned below the scroll area and kept above the keyboard (e.g. a Save button). */
  footer?: ReactNode;
  /** Offset for headers that overlap the content, if any. */
  keyboardVerticalOffset?: number;
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
export function Screen({ children, footer, keyboardVerticalOffset = 0 }: ScreenProps) {
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
        contentContainerStyle={{
          paddingHorizontal: space[4] + Math.max(insets.left, insets.right),
          paddingTop: space[4],
          paddingBottom: footer ? space[4] : space[8] + insets.bottom,
          gap: space[4],
          flexGrow: 1,
        }}
      >
        {children}
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
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
