import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { errorMessage } from '@/data/errors';
import { deleteSocialPost, hideOrReportPost, togglePostLike, useInvalidateSocial, usePostImage } from '@/data/social';
import { useTheme } from '@/theme';
import { Button, Icon, IconButton, Sheet, Text, TextField } from '@/ui';
import type { SocialPostDTO } from '@shared/application/social';

import { Avatar } from './Avatar';
import { POST_TYPE_LABEL, relativeTime, statPairs } from './format';
import { profileHref } from './PersonRow';

export const postHref = (id: string) => `/community/post/${id}` as Href;

/**
 * One activity: who, when, what happened, the public goal it belongs to, the numbers the server verified,
 * an optional photo, likes and comments. Ruled like the rest of Harada: no card chrome.
 */
export function PostCard({ post, detail = false, onRemoved }: { post: SocialPostDTO; detail?: boolean; onRemoved?: () => void }) {
  const { colors, space } = useTheme();
  const invalidate = useInvalidateSocial();
  const [liked, setLiked] = useState(post.likedByViewer);
  const [likes, setLikes] = useState(post.likeCount);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liking = useRef(false);
  const stats = statPairs(post.stats);
  const open = () => router.push(postHref(post.id));

  async function like() {
    if (liking.current) return;
    liking.current = true;
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    const res = await togglePostLike(post.id, next);
    liking.current = false;
    if (res.ok) {
      setLiked(res.data.liked);
      setLikes(res.data.likeCount);
    } else {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      setError(errorMessage(res.error));
    }
  }

  return (
    <View testID={`post-${post.id}`} style={{ gap: space[3], paddingVertical: space[4], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.rule }}>
      <View style={[styles.row, { gap: space[3] }]}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${post.author.displayName}, @${post.author.username}`}
          onPress={() => router.push(profileHref(post.author.username))}
          style={[styles.row, { flex: 1, gap: space[3] }]}
        >
          <Avatar name={post.author.displayName} uri={post.author.avatarUrl} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="body" weight="semibold" numberOfLines={1}>
              {post.author.displayName}
            </Text>
            <Text variant="meta" tone="muted" numberOfLines={1}>
              {`@${post.author.username} · ${relativeTime(post.createdAt)}${post.visibility === 'private' ? ' · Only you' : ''}`}
            </Text>
          </View>
        </Pressable>
        <IconButton icon="more" tone="muted" accessibilityLabel="Post options" onPress={() => setMenu(true)} />
      </View>

      <Pressable accessibilityRole={detail ? undefined : 'button'} accessibilityHint={detail ? undefined : 'Opens the post and its comments'} disabled={detail} onPress={open} style={{ gap: space[2] }}>
        <Text variant="caption" weight="semibold" style={{ color: colors.accent }}>
          {POST_TYPE_LABEL[post.type].toUpperCase()}
        </Text>
        {post.headline ? <Text variant="heading">{post.headline}</Text> : null}
        {post.body ? (
          <Text variant="body" numberOfLines={detail ? undefined : 6}>
            {post.body}
          </Text>
        ) : null}
        {post.goal ? (
          <View style={[styles.row, { gap: space[2] }]}>
            <Icon name="goal" size={16} color={colors.inkMuted} />
            <Text variant="meta" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
              {post.goal.title}
            </Text>
          </View>
        ) : null}
        {stats.length ? (
          <View accessibilityLabel={`Verified progress: ${stats.map((s) => `${s.label} ${s.value}`).join(', ')}`} style={[styles.row, { gap: space[6], flexWrap: 'wrap' }]}>
            {stats.map((s) => (
              <View key={s.label}>
                <Text variant="caption" tone="muted">
                  {s.label}
                </Text>
                <Text variant="headline" tabular>
                  {s.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {post.hasImage ? <PostPhoto postId={post.id} alt={post.headline || 'Progress photo'} /> : null}
      </Pressable>

      <View style={[styles.row, { gap: space[5] }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={liked ? `Unlike, ${likes} likes` : `Like, ${likes} likes`} accessibilityState={{ selected: liked }} onPress={() => void like()} style={[styles.row, styles.action, { gap: space[1] }]}>
          <Icon name={liked ? 'heartFill' : 'heart'} size={20} color={liked ? colors.accent : colors.inkMuted} />
          <Text variant="meta" tone="muted" tabular>
            {likes}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${post.commentCount} comments`} disabled={detail} onPress={open} style={[styles.row, styles.action, { gap: space[1] }]}>
          <Icon name="comment" size={20} color={colors.inkMuted} />
          <Text variant="meta" tone="muted" tabular>
            {post.commentCount}
          </Text>
        </Pressable>
      </View>
      {error ? (
        <Text variant="meta" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <PostMenu
        visible={menu}
        post={post}
        onClose={() => setMenu(false)}
        onDone={() => {
          setMenu(false);
          void invalidate();
          onRemoved?.();
        }}
      />
    </View>
  );
}

/** The photo, requested only for a post on screen; the server checks the viewer may see the post. */
function PostPhoto({ postId, alt }: { postId: string; alt: string }) {
  const { colors, radius } = useTheme();
  const image = usePostImage(postId, true);
  return (
    <View style={{ borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceSunken, aspectRatio: 4 / 3 }}>
      {image.data ? <Image source={{ uri: image.data }} style={{ flex: 1 }} contentFit="cover" accessibilityLabel={alt} /> : null}
    </View>
  );
}

function PostMenu({ visible, post, onClose, onDone }: { visible: boolean; post: SocialPostDTO; onClose: () => void; onDone: () => void }) {
  const { space } = useTheme();
  const [mode, setMode] = useState<'menu' | 'report' | 'delete'>('menu');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(p: Promise<{ ok: boolean; error?: Parameters<typeof errorMessage>[0] }>) {
    setBusy(true);
    setError(null);
    const res = await p;
    setBusy(false);
    if (!res.ok) setError(errorMessage(res.error!));
    else {
      setMode('menu');
      setReason('');
      onDone();
    }
  }

  const close = () => {
    setMode('menu');
    setError(null);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={close} title={mode === 'report' ? 'Report post' : mode === 'delete' ? 'Delete post?' : 'Post'}>
      {mode === 'menu' ? (
        <View style={{ gap: space[2] }}>
          {post.isOwnPost ? (
            <Button title="Delete post" variant="danger" onPress={() => setMode('delete')} />
          ) : (
            <>
              <Button title="Hide from my feed" variant="secondary" loading={busy} onPress={() => void run(hideOrReportPost(post.id, 'hide'))} />
              <Button title="Report" variant="secondary" onPress={() => setMode('report')} />
            </>
          )}
        </View>
      ) : mode === 'delete' ? (
        <View style={{ gap: space[3] }}>
          <Text>The post and its likes and comments are removed. Your goal is not affected.</Text>
          <Button title="Delete post" variant="danger" loading={busy} onPress={() => void run(deleteSocialPost(post.id))} />
        </View>
      ) : (
        <View style={{ gap: space[3] }}>
          <TextField label="What’s wrong? (optional)" value={reason} onChangeText={setReason} maxLength={500} multiline />
          <Button title="Send report" loading={busy} onPress={() => void run(hideOrReportPost(post.id, 'report', reason.trim() || undefined))} />
        </View>
      )}
      {error ? (
        <Text tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  action: { minHeight: 44, minWidth: 44 },
});
