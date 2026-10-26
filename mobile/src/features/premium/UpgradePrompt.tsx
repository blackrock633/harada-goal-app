import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { track, type Feature } from '@/data/premium';
import { useTheme } from '@/theme';
import { Button, Text } from '@/ui';

import { FEATURE_COPY } from './copy';
import { upgradeHref } from './routes';

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
  trigger?: 'passive' | 'action' | 'gate';
  onDismiss?: () => void;
  testID?: string;
};

/**
 * An inline note that a feature is part of Harada Pro and what it would do here. Never a modal,
 * never blocking: it sits where the feature would be, and "Not now" is respected.
 */
export function UpgradePrompt({ feature, note, trigger = 'passive', onDismiss, testID }: UpgradePromptProps) {
  const { colors, space } = useTheme();
  const [hidden, setHidden] = useState(() => trigger === 'passive' && dismissed.has(feature));
  const copy = FEATURE_COPY[feature];

  useEffect(() => {
    if (!hidden) track('upgrade_prompt_shown', { feature });
    // Once per appearance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature]);

  if (hidden) return null;

  return (
    <View
      testID={testID ?? `upgrade-prompt-${feature}`}
      style={{
        gap: space[2],
        paddingTop: space[3],
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.ruleStrong,
      }}
    >
      <Text variant="caption" weight="semibold" tone="muted">
        Harada Pro
      </Text>
      {note ? <Text variant="meta">{note}</Text> : null}
      <Text variant="body" weight="medium">
        {copy.title}
      </Text>
      <Text variant="meta" tone="muted">
        {copy.body}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2], marginTop: space[1] }}>
        <Button
          title="See Harada Pro"
          variant="secondary"
          size="compact"
          accessibilityLabel={`See Harada Pro: ${copy.title}`}
          onPress={() => router.push(upgradeHref(feature))}
        />
        {trigger === 'gate' ? null : (
          <Button
            title="Not now"
            variant="ghost"
            size="compact"
            onPress={() => {
              if (trigger === 'passive') dismissed.add(feature);
              setHidden(true);
              onDismiss?.();
            }}
          />
        )}
      </View>
    </View>
  );
}
