import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { errorMessage, newClientId } from '@/data/errors';
import { pickPhoto } from '@/data/photos';
import { createSocialPost, useInvalidateSocial } from '@/data/social';
import { CheckRow } from '@/features/challenge/controls';
import { Chip } from '@/features/matrix/Chip';
import { useTheme } from '@/theme';
import { Button, Screen, Section, SegmentedControl, Text, TextField } from '@/ui';
import type { GoalSummaryDTO } from '@shared/application/dto';
import type { SocialPostType } from '@shared/application/social';

import { POST_TYPE_LABEL } from './format';
import { postHref } from './PostCard';

const WHO = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Only me' },
] as const;

/**
 * Share progress to the community: what happened, in your words, optionally with a photo and the numbers
 * the server counts for the goal. Nothing is shared until you post. A post never makes a private goal
 * public by itself: you have to tick it.
 */
export function PostComposer({
  goals,
  initialGoalId,
  initialType = 'progress_update',
}: {
  goals: GoalSummaryDTO[];
  initialGoalId?: string;
  initialType?: SocialPostType;
}) {
  const { colors, radius, space } = useTheme();
  const invalidate = useInvalidateSocial();
  const visible = goals.filter((g) => g.status !== 'archived');
  const [goalId, setGoalId] = useState<string | null>(initialGoalId ?? visible[0]?.id ?? null);
  const goal = visible.find((g) => g.id === goalId) ?? null;
  const types: SocialPostType[] = ['progress_update', 'milestone', 'general_achievement', ...(goal?.status === 'achieved' ? (['goal_completed'] as const) : []), 'goal_started'];
  const [type, setType] = useState<SocialPostType>(types.includes(initialType) ? initialType : 'progress_update');
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [stats, setStats] = useState(true);
  const [who, setWho] = useState<'public' | 'private'>('public');
  const [makeGoalPublic, setMakeGoalPublic] = useState(false);
  const [photo, setPhoto] = useState<{ dataUri: string; width: number; height: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  // One client id per post attempt: a retry after a lost response cannot post twice.
  const clientId = useRef<string | null>(null);

  async function choosePhoto() {
    setPicking(true);
    setError(null);
    try {
      const p = await pickPhoto('post');
      if (p) setPhoto(p);
    } catch {
      setError('That photo couldn’t be used. Try another one.');
    } finally {
      setPicking(false);
    }
  }

  async function post() {
    if (posting) return;
    if (!headline.trim() && !body.trim()) {
      setFieldErrors({ headline: ['Write a headline or a few words'] });
      return;
    }
    setPosting(true);
    setError(null);
    setFieldErrors({});
    clientId.current ??= newClientId();
    const res = await createSocialPost({
      ...({ id: clientId.current } as object),
      type,
      goalId,
      visibility: who,
      headline: headline.trim() || undefined,
      body: body.trim() || undefined,
      imageUrl: photo?.dataUri ?? null,
      includeStats: !!goalId && stats,
      makeGoalPublic: who === 'public' && makeGoalPublic,
    } as Parameters<typeof createSocialPost>[0]);
    setPosting(false);
    if (!res.ok) {
      setFieldErrors(res.error.fieldErrors ?? {});
      setError(errorMessage(res.error));
      return;
    }
    clientId.current = null;
    void invalidate();
    router.replace(postHref(res.data.id));
  }

  return (
    <Screen footer={<Button title={who === 'public' ? 'Post' : 'Save privately'} loading={posting} onPress={() => void post()} />}>
      <Section title="What happened" ruled={false}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {types.map((t) => (
            <Chip key={t} role="radio" label={POST_TYPE_LABEL[t]} selected={type === t} onPress={() => setType(t)} />
          ))}
        </View>
      </Section>

      {visible.length ? (
        <Section title="Goal">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {visible.map((g) => (
              <Chip key={g.id} role="radio" label={g.title} selected={goalId === g.id} onPress={() => setGoalId(g.id)} />
            ))}
            <Chip role="radio" label="No goal" selected={goalId === null} onPress={() => setGoalId(null)} />
          </View>
        </Section>
      ) : null}

      <TextField label="Headline" value={headline} onChangeText={setHeadline} maxLength={160} error={fieldErrors.headline?.[0]} />
      <TextField label="Details (optional)" value={body} onChangeText={setBody} maxLength={2000} multiline error={fieldErrors.body?.[0]} />

      <Section title="Photo">
        {photo ? (
          <View style={{ borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceSunken, aspectRatio: photo.width / photo.height }}>
            <Image source={{ uri: photo.dataUri }} style={{ flex: 1 }} contentFit="cover" accessibilityLabel="Selected photo" />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button title={photo ? 'Change photo' : 'Add photo'} icon="photo" variant="secondary" size="compact" loading={picking} onPress={() => void choosePhoto()} />
          {photo ? <Button title="Remove" variant="ghost" size="compact" onPress={() => setPhoto(null)} /> : null}
        </View>
      </Section>

      {goalId ? <CheckRow label="Add progress numbers" meta="Counted by Harada from your plan" selected={stats} onPress={() => setStats((s) => !s)} divider={false} /> : null}

      <Section title="Who can see it">
        <SegmentedControl label="Who can see it" options={WHO} value={who} onChange={setWho} />
        {who === 'public' && goal ? (
          <CheckRow
            label="Make this goal public"
            meta="Needed if the goal is private"
            selected={makeGoalPublic}
            onPress={() => setMakeGoalPublic((m) => !m)}
            divider={false}
          />
        ) : null}
      </Section>

      {error ? (
        <Text tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button title="Share as an image instead" variant="ghost" onPress={() => router.push((goalId ? `/share-card?goalId=${goalId}` : '/share-card') as Href)} />
    </Screen>
  );
}
