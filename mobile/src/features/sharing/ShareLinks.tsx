import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Share, View } from 'react-native';

import { errorMessage } from '@/data/errors';
import {
  createShareLink,
  premiumKeys,
  referralUrl,
  revokeShareLink,
  shareUrl,
  useReferrals,
  useShareLinks,
  type CardInput,
  type ShareLink,
} from '@/data/premium';
import { messageFor } from '@/screens/queryState';
import { useTheme } from '@/theme';
import { Badge, Button, ListRow, Section, SegmentedControl, Sheet, Text } from '@/ui';
import { formatLocalDate } from '@/features/today/format';
import { KIND_LABEL } from './formats';

const EXPIRY_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;
type Expiry = (typeof EXPIRY_OPTIONS)[number]['value'];

export const NOT_CONFIGURED = 'Public links need the web app address configured. You can still share the card as an image.';

const day = (iso: string) => formatLocalDate(iso.slice(0, 10), 'short');

export function linkStatus(l: ShareLink, now = Date.now()): 'live' | 'revoked' | 'expired' {
  if (l.revokedAt) return 'revoked';
  if (l.expiresAt && new Date(l.expiresAt).getTime() <= now) return 'expired';
  return 'live';
}

const shareText = (url: string) => Share.share({ message: url, url }).catch(() => undefined);

/**
 * Explicit, optional publishing: a page anyone with the link can open, showing the previewed card.
 * `ready` is false while the preview is catching up, so the link always matches what the user saw.
 */
export function PublicLink({ input, ready, configured }: { input: CardInput; ready: boolean; configured: boolean }) {
  const { space } = useTheme();
  const qc = useQueryClient();
  const [expiry, setExpiry] = useState<Expiry>('30');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const inFlight = useRef(false);
  const inputKey = JSON.stringify(input);

  // A new card is a new link: the one just created stays in "Your links".
  useEffect(() => setCreated(null), [inputKey]);

  async function create() {
    if (inFlight.current || !ready) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await createShareLink(input, Number(expiry));
      if (res.ok) {
        setCreated(shareUrl(res.data.token));
        void qc.invalidateQueries({ queryKey: premiumKeys.shareLinks });
      } else setError(errorMessage(res.error));
    } catch {
      setError(errorMessage({ code: 'UNAVAILABLE', message: '' }));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title="Public link" description="Optional. Anyone with the link can see this card, exactly as previewed. You can revoke it at any time.">
      {!configured ? (
        <Text variant="body" tone="muted">
          {NOT_CONFIGURED}
        </Text>
      ) : created ? (
        <View style={{ gap: space[2] }}>
          <Text variant="meta" tone="muted">
            Link created
          </Text>
          <Text variant="body" selectable testID="created-link">
            {created}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
            <Button title="Share link" variant="secondary" onPress={() => void shareText(created)} />
          </View>
        </View>
      ) : (
        <View style={{ gap: space[3] }}>
          <SegmentedControl label="Link expires after" options={EXPIRY_OPTIONS} value={expiry} onChange={setExpiry} />
          {error ? (
            <Text variant="body" tone="danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <View style={{ alignItems: 'flex-start' }}>
            <Button title="Create public link" variant="secondary" loading={busy} disabled={!ready} onPress={() => void create()} />
          </View>
        </View>
      )}
    </Section>
  );
}

/** Every link the user created, with views; live ones can be shared again or revoked (after confirmation). */
export function YourLinks() {
  const { space } = useTheme();
  const qc = useQueryClient();
  const links = useShareLinks();
  const [confirm, setConfirm] = useState<ShareLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    if (!confirm || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await revokeShareLink(confirm.id);
      if (res.ok) {
        setConfirm(null);
        void qc.invalidateQueries({ queryKey: premiumKeys.shareLinks });
      } else setError(errorMessage(res.error));
    } catch {
      setError(errorMessage({ code: 'UNAVAILABLE', message: '' }));
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (links.isPending) body = <Text variant="meta" tone="muted">Loading your links…</Text>;
  else if (links.isError && !links.data)
    body = (
      <View style={{ gap: space[1], alignItems: 'flex-start' }}>
        <Text variant="body" tone="danger">
          {messageFor(links.error)}
        </Text>
        <Button title="Try again" variant="secondary" size="compact" onPress={() => void links.refetch()} />
      </View>
    );
  else if (!links.data || links.data.length === 0) body = <Text variant="body" tone="muted">You haven&apos;t created any public links.</Text>;
  else
    body = (
      <View>
        {links.data.map((l, i) => {
          const status = linkStatus(l);
          const url = shareUrl(l.token);
          const meta = [
            `${l.viewCount} ${l.viewCount === 1 ? 'view' : 'views'}`,
            `created ${day(l.createdAt)}`,
            status === 'revoked' ? `revoked ${day(l.revokedAt!)}` : l.expiresAt ? `${status === 'expired' ? 'expired' : 'expires'} ${day(l.expiresAt)}` : 'no expiry',
          ].join(' · ');
          return (
            <ListRow
              key={l.id}
              testID={`share-link-${l.id}`}
              title={`${KIND_LABEL[l.kind]} card`}
              meta={meta}
              divider={i < links.data.length - 1}
              onPress={status === 'live' && url ? () => void shareText(url) : undefined}
              accessibilityHint={status === 'live' && url ? 'Shares the link' : undefined}
              trailing={
                status === 'live' ? (
                  <Button
                    title="Revoke"
                    variant="danger"
                    size="compact"
                    accessibilityLabel={`Revoke ${KIND_LABEL[l.kind]} card link created ${day(l.createdAt)}`}
                    onPress={() => {
                      setError(null);
                      setConfirm(l);
                    }}
                  />
                ) : (
                  <Badge text={status === 'revoked' ? 'Revoked' : 'Expired'} />
                )
              }
            />
          );
        })}
      </View>
    );

  return (
    <Section title="Your links">
      {body}
      <Sheet
        visible={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Revoke this link?"
        footer={
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
            <Button title="Cancel" variant="secondary" onPress={() => setConfirm(null)} />
            <Button title="Revoke link" variant="danger" loading={busy} onPress={() => void revoke()} />
          </View>
        }
      >
        <Text variant="body">The page stops working for everyone who has the link. This can&apos;t be undone; you can create a new link later.</Text>
        {error ? (
          <Text variant="body" tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Sheet>
    </Section>
  );
}

/** The user's referral link and what came of it. Rendered only when the web address is configured. */
export function InviteFriend() {
  const { space } = useTheme();
  const referrals = useReferrals();
  const url = referrals.data ? referralUrl(referrals.data.code) : null;
  if (referrals.isPending || (referrals.isError && !referrals.data)) return null;
  if (!referrals.data || !url) return null;
  const r = referrals.data;
  return (
    <Section title="Invite a friend" description="Your link to the Harada home page. We count sign-ups, nothing else.">
      <Text variant="body" selectable testID="referral-link">
        {url}
      </Text>
      <Text variant="meta" tone="muted" tabular>
        {`${r.signups} signed up · ${r.conversions} became Pro`}
      </Text>
      <View style={{ alignItems: 'flex-start', gap: space[1] }}>
        <Button title="Share invite" variant="secondary" onPress={() => void shareText(url)} />
      </View>
    </Section>
  );
}
