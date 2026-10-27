import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { errorMessage } from '@/data/errors';
import { previewCard, track, webOrigin, type Card, type CardKind } from '@/data/premium';
import { SkeletonLines } from '@/screens/queryState';
import { useTheme } from '@/theme';
import { Button, Screen, Section, SegmentedControl, Text, TextField, useLayout } from '@/ui';
import { CheckRow } from '@/features/challenge/controls';
import {
  CARD_TEXT_MAX,
  EMPTY_STATE,
  FIELDS,
  FORMATS,
  KIND_LABEL,
  STATS_HINT,
  buildInput,
  fieldLabel,
  type ComposerState,
  type FormatId,
  type TextKey,
} from './formats';
import { InviteFriend, PublicLink, YourLinks } from './ShareLinks';
import { ShareCard } from './ShareCard';

/** Wait this long after the last change before asking the server for a new preview. */
export const PREVIEW_DEBOUNCE_MS = 350;

const FORMAT_OPTIONS = (Object.keys(FORMATS) as FormatId[]).map((id) => ({ value: id, label: FORMATS[id].label }));

/**
 * Compose a progress card. Everything starts hidden; the user ticks what to include and may add a few
 * lines in their own words. The preview is the card exactly as the server builds it (numbers come from
 * stored data), and the exported image and any public link use that same card. Nothing is published
 * unless the user asks for a link.
 */
export function ShareComposer({ goalId, kind }: { goalId: string; kind: CardKind }) {
  const { space } = useTheme();
  const { width: screenWidth } = useLayout();
  const [state, setState] = useState<ComposerState>(EMPTY_STATE);
  const [format, setFormat] = useState<FormatId>('square');
  const input = useMemo(() => buildInput(goalId, kind, state), [goalId, kind, state]);
  const inputKey = JSON.stringify(input);

  // Preview: debounced; only the latest request may land.
  const [card, setCard] = useState<Card | null>(null);
  const [cardKey, setCardKey] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      previewCard(JSON.parse(inputKey))
        .then((r) => {
          if (mine !== seq.current) return;
          if (r.ok) {
            setCard(r.data);
            setCardKey(inputKey);
            setPreviewError(null);
          } else setPreviewError(errorMessage(r.error));
        })
        .catch(() => mine === seq.current && setPreviewError(errorMessage({ code: 'UNAVAILABLE', message: '' })));
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputKey, retry]);
  const current = !!card && cardKey === inputKey;

  // Export
  const cardRef = useRef<ComponentRef<typeof View>>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  async function exportImage() {
    if (exporting || !current) return;
    setExporting(true);
    setExportMsg(null);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setExportMsg("Sharing images isn't available on this device.");
        return;
      }
      const f = FORMATS[format];
      const uri = await captureRef(cardRef, { format: 'png', width: f.width, height: f.height, result: 'tmpfile' });
      track('progress_card_generated', { kind, format });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your card', UTI: 'public.png' });
    } catch {
      setExportMsg("Couldn't create the image. Try again.");
    } finally {
      setExporting(false);
    }
  }

  const setShow = (key: keyof ComposerState['show']) => setState((s) => ({ ...s, show: { ...s.show, [key]: !s.show[key] } }));
  const setText = (key: TextKey, v: string) => setState((s) => ({ ...s, text: { ...s.text, [key]: v } }));

  // The preview fits the column; Story is drawn narrower so it is not taller than the phone.
  const column = Math.min(screenWidth - space[4] * 2, 680);
  const drawWidth = Math.max(200, Math.min(column, format === 'story' ? 300 : 420));
  const nothingChosen = !input.show.goalTitle && !input.show.stats && !input.show.name && FIELDS[kind].every((k) => !input[k]);

  return (
    <Screen>
      <View style={{ gap: space[1] }}>
        <Text variant="title">{`${KIND_LABEL[kind]} card`}</Text>
        <Text variant="body" tone="muted">
          Only what you tick appears on the card. Numbers are counted from what you logged. Nothing is shared until you share
          it.
        </Text>
      </View>

      <Section title="Preview" ruled={false}>
        <SegmentedControl label="Image format" options={FORMAT_OPTIONS} value={format} onChange={setFormat} />
        <View style={{ alignItems: 'center', gap: space[2] }}>
          {card ? (
            <View style={{ opacity: current ? 1 : 0.5 }} accessibilityState={{ busy: !current }}>
              <ShareCard ref={cardRef} card={card} format={format} width={drawWidth} />
            </View>
          ) : previewError ? null : (
            <View style={{ width: drawWidth, paddingVertical: space[4] }}>
              <SkeletonLines label="Preparing the preview" widths={['64%', '42%', '78%']} />
            </View>
          )}
          <Text variant="caption" tone="muted" tabular>
            {`${FORMATS[format].width} × ${FORMATS[format].height}${card && !current && !previewError ? ' · updating…' : ''}`}
          </Text>
        </View>
        {previewError ? (
          <View style={{ gap: space[1], alignItems: 'flex-start' }}>
            <Text variant="body" tone="danger" accessibilityRole="alert">
              {previewError}
            </Text>
            <Button title="Try again" variant="secondary" size="compact" onPress={() => setRetry((n) => n + 1)} />
          </View>
        ) : null}
        {nothingChosen ? (
          <Text variant="meta" tone="muted">
            Nothing is on the card yet. Tick what to show, or add a line below.
          </Text>
        ) : null}
      </Section>

      <Section title="Show on the card">
        <View>
          <CheckRow label="Goal title" selected={state.show.goalTitle} onPress={() => setShow('goalTitle')} />
          <CheckRow label="Numbers" meta={STATS_HINT[kind]} selected={state.show.stats} onPress={() => setShow('stats')} />
          <CheckRow label="Your name" meta="Your display name" selected={state.show.name} onPress={() => setShow('name')} divider={false} />
        </View>
      </Section>

      <Section title="In your words" description="Optional. Leave a field empty to keep it off the card.">
        {FIELDS[kind].map((key) => (
          <TextField
            key={key}
            label={fieldLabel(key, kind)}
            value={state.text[key] ?? ''}
            onChangeText={(v) => setText(key, v)}
            maxLength={CARD_TEXT_MAX}
          />
        ))}
      </Section>

      <Section title="Share as an image">
        <Text variant="meta" tone="muted">
          Saves the card above as a picture and opens your share sheet. No link is created.
        </Text>
        {exportMsg ? (
          <Text variant="body" tone="danger" accessibilityRole="alert">
            {exportMsg}
          </Text>
        ) : null}
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            title={`Share image (${FORMATS[format].label})`}
            loading={exporting}
            disabled={!current}
            onPress={() => void exportImage()}
          />
        </View>
      </Section>

      <PublicLink input={input} ready={current} configured={webOrigin() !== null} />
      <YourLinks />
      {webOrigin() !== null ? <InviteFriend /> : null}
    </Screen>
  );
}
