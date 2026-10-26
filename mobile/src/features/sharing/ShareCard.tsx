import type { ComponentRef, Ref } from 'react';
import { Text as RNText, StyleSheet, View, type TextStyle } from 'react-native';

import type { Card } from '@/data/premium';
import { fontFamily, lightColors } from '@/theme';
import { formatLocalDate } from '@/features/today/format';
import { CARD_LABEL, FORMATS, KIND_LABEL, cardStats, type FormatId, type TextKey } from './formats';

const TEXT_ORDER: TextKey[] = ['accomplishment', 'milestone', 'lesson', 'nextPriority'];

/**
 * The card as an image: paper, ink, hairline rules, Mincho for the goal, the mark small at the bottom
 * (its centre is the one vermilion). Always the light paper palette, so the exported image looks the
 * same whatever the device scheme. Sizes are in image pixels and scaled to the drawn width.
 * Shows only what the server returned: nothing else from the goal.
 */
export function ShareCard({ card, format, width, ref }: { card: Card; format: FormatId; width: number; ref?: Ref<ComponentRef<typeof View>> }) {
  const f = FORMATS[format];
  const k = width / f.width;
  const wide = format === 'wide';
  const story = format === 'story';
  const c = lightColors;
  const px = (n: number) => n * k;
  const t = (size: number, extra: TextStyle = {}): TextStyle => ({ fontSize: px(size), lineHeight: px(size * 1.3), color: c.ink, ...extra });

  const stats = cardStats(card);
  const texts = TEXT_ORDER.filter((key) => !!card[key]);
  const kicker = [KIND_LABEL[card.kind], card.kind === 'weekly' && card.stats?.weekStart ? `Week of ${formatLocalDate(card.stats.weekStart, 'short')}` : null]
    .filter(Boolean)
    .join(' · ');
  const lines = wide ? 2 : story ? 5 : 3;

  return (
    <View
      ref={ref}
      collapsable={false}
      testID="share-card"
      accessible
      accessibilityRole="image"
      accessibilityLabel={describeCard(card)}
      style={{ width, height: width * (f.height / f.width), backgroundColor: c.paper, padding: px(wide ? 64 : 88), overflow: 'hidden' }}
    >
      <View style={{ flex: 1, gap: px(wide ? 24 : 40), justifyContent: story ? 'center' : 'flex-start' }}>
        <RNText allowFontScaling={false} style={t(wide ? 26 : 32, { color: c.inkMuted, letterSpacing: px(3), textTransform: 'uppercase' })}>
          {kicker}
        </RNText>
        {card.goalTitle ? (
          <RNText
            allowFontScaling={false}
            numberOfLines={wide ? 2 : 4}
            style={t(wide ? 56 : story ? 84 : 72, { fontFamily: fontFamily.display, lineHeight: px((wide ? 56 : story ? 84 : 72) * 1.25) })}
          >
            {card.goalTitle}
          </RNText>
        ) : null}
        {stats.length > 0 ? (
          <View style={{ borderTopWidth: Math.max(1, px(2)), borderTopColor: c.ruleStrong, paddingTop: px(wide ? 20 : 32), flexDirection: wide || !story ? 'row' : 'column', flexWrap: 'wrap', gap: px(wide ? 40 : 48) }}>
            {stats.map((s) => (
              <View key={s.label} style={{ gap: px(4) }}>
                <RNText allowFontScaling={false} style={t(wide ? 60 : story ? 104 : 80, { fontWeight: '600', fontVariant: ['tabular-nums'] })}>
                  {s.value}
                </RNText>
                <RNText allowFontScaling={false} style={t(wide ? 24 : 30, { color: c.inkMuted })}>
                  {s.label}
                </RNText>
              </View>
            ))}
          </View>
        ) : null}
        {texts.length > 0 ? (
          <View style={{ gap: px(wide ? 16 : 28) }}>
            {texts.slice(0, wide ? 2 : 4).map((key) => (
              <View key={key} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.rule, paddingTop: px(wide ? 12 : 20), gap: px(6) }}>
                <RNText allowFontScaling={false} style={t(wide ? 22 : 28, { color: c.inkMuted, letterSpacing: px(2), textTransform: 'uppercase' })}>
                  {CARD_LABEL[key]}
                </RNText>
                <RNText allowFontScaling={false} numberOfLines={lines} style={t(wide ? 32 : story ? 48 : 40)}>
                  {card[key]}
                </RNText>
              </View>
            ))}
          </View>
        ) : null}
        {card.name ? (
          <RNText allowFontScaling={false} style={t(wide ? 26 : 34, { color: c.inkMuted })}>
            {`— ${card.name}`}
          </RNText>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(16), marginTop: px(wide ? 16 : 32) }}>
        <CardMark size={px(wide ? 40 : 52)} />
        <RNText allowFontScaling={false} style={t(wide ? 24 : 30, { fontFamily: fontFamily.display })}>
          Harada
        </RNText>
      </View>
    </View>
  );
}

/** The Open Window mark in the fixed paper palette (HaradaMark follows the device scheme). */
function CardMark({ size }: { size: number }) {
  const u = size / 96;
  const c = lightColors;
  return (
    <View style={{ width: size, height: size }}>
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((col) =>
          r === 1 && col === 1 ? (
            <View key="c" style={{ position: 'absolute', left: 34 * u, top: 34 * u, width: 28 * u, height: 28 * u, borderRadius: 6 * u, backgroundColor: c.accent }} />
          ) : (
            <View
              key={`${r}${col}`}
              style={{ position: 'absolute', left: col * 36 * u, top: r * 36 * u, width: 24 * u, height: 24 * u, borderRadius: 6 * u, borderWidth: 4 * u, borderColor: c.ink }}
            />
          ),
        ),
      )}
    </View>
  );
}

/** The card read aloud, in the same order it is drawn. */
export function describeCard(card: Card): string {
  const parts = [`${KIND_LABEL[card.kind]} card`];
  if (card.goalTitle) parts.push(card.goalTitle);
  for (const s of cardStats(card)) parts.push(`${s.value} ${s.label}`);
  for (const key of TEXT_ORDER) if (card[key]) parts.push(`${CARD_LABEL[key]}: ${card[key]}`);
  if (card.name) parts.push(`by ${card.name}`);
  return parts.join('. ');
}
