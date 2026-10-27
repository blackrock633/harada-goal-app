import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { IconButton } from './IconButton';
import { useReduceMotion } from './use-reduce-motion';
import { Text } from './Text';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Accessible title, also rendered as the sheet heading. */
  title: string;
  children: ReactNode;
  /** Pinned below the content, kept above the keyboard (e.g. Save). */
  footer?: ReactNode;
};

/**
 * Modal bottom sheet for editors. `onRequestClose` covers the Android back button and
 * hardware Escape; the backdrop and an explicit Close button also dismiss it.
 */
export function Sheet({ visible, onClose, title, children, footer }: SheetProps) {
  const { colors, radius, space } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  if (!visible) return null;
  return (
    <Modal
      testID="sheet-modal"
      visible={visible}
      transparent
      animationType={reduceMotion ? 'fade' : 'slide'}
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
          style={[styles.flex, { backgroundColor: colors.scrim }]}
        />
        <View
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={{
            maxHeight: '88%',
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: colors.rule,
          }}
        >
          <View style={[styles.grabber, { backgroundColor: colors.ruleStrong, marginTop: space[2] }]} />
          <View style={[styles.header, { paddingLeft: space[4], paddingRight: space[2], paddingTop: space[1] }]}>
            <Text variant="heading" style={styles.flex}>
              {title}
            </Text>
            <IconButton icon="close" accessibilityLabel="Close" tone="muted" onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: space[4], gap: space[4] }}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View
              style={{
                paddingHorizontal: space[4],
                paddingTop: space[3],
                paddingBottom: space[3] + insets.bottom,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.rule,
              }}
            >
              {footer}
            </View>
          ) : (
            <View style={{ height: insets.bottom }} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grabber: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center' },
});
