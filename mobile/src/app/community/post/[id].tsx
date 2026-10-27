import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage } from '@/data/errors';
import { addPostComment, deletePostComment, getSocialPost, useInvalidateSocial, usePost } from '@/data/social';
import { Avatar } from '@/features/social/Avatar';
import { relativeTime } from '@/features/social/format';
import { PostCard } from '@/features/social/PostCard';
import { ErrorScreen, LoadingScreen } from '@/screens/queryState';
import { useTheme } from '@/theme';
import { Button, IconButton, Screen, Section, Text, TextField } from '@/ui';
import type { SocialCommentDTO } from '@shared/application/social';

/** Same limit as the server (addPostCommentSchema / add_post_comment). */
const COMMENT_MAX = 500;

/** One post with its comments (newest page first, older on request) and the comment box. */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const post = usePost(id);
  const invalidate = useInvalidateSocial();
  const { colors, space } = useTheme();
  const [older, setOlder] = useState<SocialCommentDTO[]>([]);
  const [cursor, setCursor] = useState<{ before: string; beforeId: string } | null | undefined>(undefined);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (post.data && cursor === undefined) setCursor(post.data.olderComments ?? null);
  }, [post.data, cursor]);

  if (post.isPending) return <LoadingScreen label="Loading post" />;
  if (post.isError) return <ErrorScreen error={post.error} onRetry={() => void post.refetch()} />;
  const p = post.data;
  const comments = [...older, ...(p.comments ?? [])];

  async function loadOlder() {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    const res = await getSocialPost(p.id, cursor);
    setLoadingOlder(false);
    if (!res.ok) return setError(errorMessage(res.error));
    setOlder((o) => [...(res.data.comments ?? []), ...o]);
    setCursor(res.data.olderComments ?? null);
  }

  async function send() {
    const body = text.trim();
    if (!body || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    const res = await addPostComment(p.id, body);
    inFlight.current = false;
    setSending(false);
    if (!res.ok) return setError(errorMessage(res.error));
    setText('');
    void invalidate();
  }

  async function remove(c: SocialCommentDTO) {
    const res = await deletePostComment(c.id);
    if (!res.ok) return setError(errorMessage(res.error));
    setOlder((o) => o.filter((x) => x.id !== c.id));
    void invalidate();
  }

  return (
    <Screen
      footer={
        <View style={{ gap: space[2] }}>
          <TextField label="Add a comment" value={text} onChangeText={setText} maxLength={COMMENT_MAX} multiline editable={!sending} />
          <Button title="Post comment" loading={sending} disabled={!text.trim()} onPress={() => void send()} />
        </View>
      }
    >
      <PostCard post={p} detail onRemoved={() => router.back()} />
      {error ? (
        <Text tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Section title={`Comments (${p.commentCount})`}>
        {cursor ? <Button title="Show earlier comments" variant="ghost" size="compact" loading={loadingOlder} onPress={() => void loadOlder()} /> : null}
        {comments.length === 0 ? (
          <Text tone="muted">No comments yet.</Text>
        ) : (
          <View>
            {comments.map((c, i) => (
              <View
                key={c.id}
                style={[styles.row, { gap: space[3], paddingVertical: space[3], borderBottomWidth: i < comments.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.rule }]}
              >
                <Avatar name={c.author.displayName} uri={c.author.avatarUrl} size={32} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="meta" tone="muted">
                    <Text variant="meta" weight="semibold">
                      {c.author.displayName}
                    </Text>
                    {` · ${relativeTime(c.createdAt)}`}
                  </Text>
                  <Text>{c.body}</Text>
                </View>
                {c.canDelete ? <IconButton icon="close" tone="muted" accessibilityLabel="Delete comment" onPress={() => void remove(c)} /> : null}
              </View>
            ))}
          </View>
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'flex-start' } });
