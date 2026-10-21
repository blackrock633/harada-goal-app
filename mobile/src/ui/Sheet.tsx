import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { Button } from './Button';
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
  return (
    <Modal
      testID="sheet-modal"
      visible={visible}
      transparent
      animationType="slide"
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
          style={[styles.flex, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
        />
        <View
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={{
            maxHeight: '85%',
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.md,
            borderTopRightRadius: radius.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: colors.rule,
          }}
        >
          <View style={[styles.header, { paddingHorizontal: space[4], paddingTop: space[3] }]}>
            <Text variant="heading" style={styles.flex}>
              {title}
            </Text>
            <Button title="Close" variant="ghost" onPress={onClose} />
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
});
