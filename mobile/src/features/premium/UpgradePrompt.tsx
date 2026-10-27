import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { track, type Feature } from '@/data/premium';
import { useTheme } from '@/theme';
import { Button, Icon, IconButton, Text } from '@/ui';

import { FEATURE_COPY } from './copy';
import { openUpgrade } from './routes';
import { Paywall } from './UpgradeView';

/** Features whose passive prompt the user dismissed with "Not now" in this app session. */
const dismissed = new Set<Feature>();

/** Test hook: forget every "Not now". */
export function resetUpgradePromptDismissals() {
  dismissed.clear();
}

export type UpgradePromptProps = {
  feature: Feature;
  /** A line of context above the benefit, e.g. "Your goal is saved as a draft." */
  note?: string;
  /**
   * 'passive' (default): shown unasked; "Not now" hides it for the rest of the session.
   * 'action': the user just tried the feature; "Not now" hides only this instance.
   * 'gate': the prompt is the whole content of a locked screen; no "Not now".
   */
  trigger?: 'passive' | 'action' | 'gate' | 'locked';
  onDismiss?: () => void;
  testID?: string;
};

/**
 * How a locked Pro feature shows up:
 *  - 'gate': the feature is the whole screen (challenge, history): the paywall itself, in its place.
 *  - 'action': the user just tried it: the full-screen paywall opens once, and a lock row stays behind.
 *  - 'passive': a one-line lock row; tapping it opens the paywall. "Not now" hides it for the session.
 *  - 'locked': the same row without "Not now", for a control the user already chose (e.g. Weekly).
 * The server refuses every Pro read and write for a Free user regardless (HG402).
 */
export function UpgradePrompt({ feature, note, trigger = 'passive', onDismiss, testID }: UpgradePromptProps) {
  const { colors, space } = useTheme();
  const [hidden, setHidden] = useState(() => trigger === 'passive' && dismissed.has(feature));
  const opened = useRef(false);
  const copy = FEATURE_COPY[feature];

  useEffect(() => {
    if (hidden) return;
    track('upgrade_prompt_shown', { feature });
    if (trigger === 'action' && !opened.current) {
      opened.current = true;
      openUpgrade(feature, note);
    }
    // Once per appearance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature]);

  if (hidden) return null;
  if (trigger === 'gate') {
    return (
      <View testID={testID ?? `upgrade-prompt-${feature}`}>
        <Paywall feature={feature} note={note} />
      </View>
    );
  }

  return (
    <View
      testID={testID ?? `upgrade-prompt-${feature}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingTop: space[3],
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.rule,
      }}
    >
      <Icon name="lock" size={16} color={colors.inkMuted} />
      <Text variant="body" weight="medium" style={{ flex: 1 }}>
        {copy.title}
      </Text>
      <Button
        title="Unlock"
        variant="secondary"
        size="compact"
        accessibilityLabel={`Unlock with Harada Pro: ${copy.title}`}
        onPress={() => openUpgrade(feature, note)}
      />
      {trigger === 'passive' ? (
        <IconButton
          icon="close"
          tone="muted"
          accessibilityLabel="Not now"
          onPress={() => {
            dismissed.add(feature);
            setHidden(true);
            onDismiss?.();
          }}
        />
      ) : null}
    </View>
  );
}
