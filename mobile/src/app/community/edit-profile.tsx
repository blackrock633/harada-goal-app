import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { errorMessage } from '@/data/errors';
import { pickPhoto } from '@/data/photos';
import {
  listBlockedUsers,
  setGoalVisibility,
  unblockUser,
  updateSocialProfile,
  useInvalidateSocial,
  useSocialProfile,
} from '@/data/social';
import { Avatar } from '@/features/social/Avatar';
import { ErrorScreen, LoadingScreen } from '@/screens/queryState';
import { useTheme } from '@/theme';
import { Button, Screen, Section, SegmentedControl, Text, TextField } from '@/ui';
import type { BlockedUserDTO, GoalVisibility, OwnGoalVisibilityDTO, ProfilePrivacyDTO } from '@shared/application/social';

const PRIVACY = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
] as const;
const VISIBILITY = [
  { value: 'private', label: 'Private' },
  { value: 'public', label: 'Public' },
] as const;

/** Your profile and what is public. Goals stay private unless you make each one public here. */
export default function EditProfileScreen() {
  const { space } = useTheme();
  const me = useSocialProfile('me');
  const invalidate = useInvalidateSocial();
  const [form, setForm] = useState<
    | ({ displayName: string; username: string; bio: string; location: string; isPrivate: boolean; avatarUrl: string | null } & Partial<ProfilePrivacyDTO>)
    | null
  >(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (me.data && !form) {
      const d = me.data;
      setForm({ displayName: d.displayName, username: d.username, bio: d.bio, location: d.location, isPrivate: d.isPrivate, avatarUrl: d.avatarUrl, ...(d.privacy ?? {}) });
    }
  }, [me.data, form]);

  if (me.isPending || (me.data && !form)) return <LoadingScreen label="Loading profile" />;
  if (me.isError) return <ErrorScreen error={me.error} onRetry={() => void me.refetch()} />;
  const f = form!;
  const set = (patch: Partial<typeof f>) => setForm({ ...f, ...patch });

  async function choosePhoto() {
    setPicking(true);
    setError(null);
    try {
      const photo = await pickPhoto('avatar');
      if (photo) set({ avatarUrl: photo.dataUri });
    } catch {
      setError('That photo couldn’t be used. Try another one.');
    } finally {
      setPicking(false);
    }
  }

  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    setFieldErrors({});
    const d = me.data!;
    const res = await updateSocialProfile({
      displayName: f.displayName,
      username: f.username,
      bio: f.bio,
      location: f.location,
      isPrivate: f.isPrivate,
      ...(f.avatarUrl !== d.avatarUrl ? { avatarUrl: f.avatarUrl } : {}),
      // Only a database with the identity migration reports privacy settings, so only then are they sent.
      ...(d.privacy
        ? { showAchievements: f.showAchievements, showProgressMetrics: f.showProgressMetrics, foundingBadgeOnPosts: f.foundingBadgeOnPosts }
        : {}),
    });
    inFlight.current = false;
    setSaving(false);
    if (!res.ok) {
      setFieldErrors(res.error.fieldErrors ?? {});
      setError(errorMessage(res.error));
      return;
    }
    void invalidate();
    router.back();
  }

  return (
    <Screen footer={<Button title="Save" loading={saving} onPress={() => void save()} />}>
      <View style={{ alignItems: 'center', gap: space[3] }}>
        <Avatar name={f.displayName} uri={f.avatarUrl} size={96} />
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button title={f.avatarUrl ? 'Change photo' : 'Add photo'} variant="secondary" size="compact" icon="photo" loading={picking} onPress={() => void choosePhoto()} />
          {f.avatarUrl ? <Button title="Remove" variant="ghost" size="compact" onPress={() => set({ avatarUrl: null })} /> : null}
        </View>
      </View>
      <TextField label="Name" value={f.displayName} onChangeText={(v) => set({ displayName: v })} maxLength={80} error={fieldErrors.displayName?.[0]} />
      <TextField
        label="Username"
        value={f.username}
        onChangeText={(v) => set({ username: v.toLowerCase() })}
        maxLength={30}
        autoCapitalize="none"
        autoCorrect={false}
        error={fieldErrors.username?.[0]}
      />
      <TextField label="Bio" value={f.bio} onChangeText={(v) => set({ bio: v })} maxLength={280} multiline error={fieldErrors.bio?.[0]} />
      <TextField label="Location" value={f.location} onChangeText={(v) => set({ location: v })} maxLength={80} error={fieldErrors.location?.[0]} />
      <Section title="Profile">
        <SegmentedControl label="Profile visibility" options={PRIVACY} value={f.isPrivate ? 'private' : 'public'} onChange={(v) => set({ isPrivate: v === 'private' })} />
        {f.isPrivate ? (
          <Text variant="meta" tone="muted">
            Only you see your goals and posts.
          </Text>
        ) : null}
      </Section>
      {me.data!.privacy ? (
        <Section title="What others see" description="Private goals, reflections and notes are never shown, whatever you choose here.">
          <PrivacySwitch label="Show my achievements" value={!!f.showAchievements} onChange={(v) => set({ showAchievements: v })} />
          <PrivacySwitch
            label="Show progress figures for my featured goal"
            value={!!f.showProgressMetrics}
            onChange={(v) => set({ showProgressMetrics: v })}
          />
          {me.data!.foundingMember ? (
            <PrivacySwitch
              label="Show my Founding Member badge on posts"
              value={!!f.foundingBadgeOnPosts}
              onChange={(v) => set({ foundingBadgeOnPosts: v })}
            />
          ) : null}
        </Section>
      ) : null}
      <GoalVisibilityList goals={me.data!.ownGoals} onChanged={() => void invalidate()} />
      <BlockedAccounts />
      {error ? (
        <Text tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

/** Each goal is private until you make it public. Making it private again hides its old posts too. */
function GoalVisibilityList({ goals, onChanged }: { goals: OwnGoalVisibilityDTO[]; onChanged: () => void }) {
  const { colors, space } = useTheme();
  const [vis, setVis] = useState<Record<string, GoalVisibility>>(() => Object.fromEntries(goals.map((g) => [g.id, g.visibility])));
  const [error, setError] = useState<string | null>(null);
  if (goals.length === 0) return null;
  return (
    <Section title="Public goals">
      <View>
        {goals.map((g, i) => (
          <View key={g.id} style={{ gap: space[2], paddingVertical: space[3], borderBottomWidth: i < goals.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.rule }}>
            <Text variant="body" weight="medium" numberOfLines={2}>
              {g.title}
            </Text>
            <SegmentedControl
              label={`Visibility of ${g.title}`}
              options={VISIBILITY}
              value={vis[g.id] ?? g.visibility}
              onChange={async (v) => {
                const prev = vis[g.id] ?? g.visibility;
                setVis((x) => ({ ...x, [g.id]: v }));
                const res = await setGoalVisibility({ goalId: g.id, visibility: v });
                if (!res.ok) {
                  setVis((x) => ({ ...x, [g.id]: prev }));
                  setError(errorMessage(res.error));
                } else onChanged();
              }}
            />
          </View>
        ))}
      </View>
      {error ? (
        <Text tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </Section>
  );
}

function PrivacySwitch({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], minHeight: 44 }}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

/** People you blocked, loaded on request, each with Unblock. */
function BlockedAccounts() {
  const { colors, space } = useTheme();
  const [items, setItems] = useState<BlockedUserDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setError(null);
    const res = await listBlockedUsers();
    if (res.ok) setItems(res.data.items);
    else setError(errorMessage(res.error));
  };
  const unblock = async (b: BlockedUserDTO) => {
    const res = await unblockUser(b.userId);
    if (res.ok) setItems((prev) => (prev ?? []).filter((x) => x.userId !== b.userId));
    else setError(errorMessage(res.error));
  };
  return (
    <Section
      title="Blocked accounts"
      action={items === null ? <Button title="Show" variant="ghost" size="compact" onPress={() => void load()} /> : undefined}
    >
      {items?.length === 0 ? (
        <Text variant="meta" tone="muted">
          You have not blocked anyone.
        </Text>
      ) : null}
      {items?.map((b, i) => (
        <View
          key={b.userId}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            paddingVertical: space[2],
            borderBottomWidth: i < items.length - 1 ? StyleSheet.hairlineWidth : 0,
            borderBottomColor: colors.rule,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1}>{b.displayName}</Text>
            <Text variant="meta" tone="muted" numberOfLines={1}>{`@${b.username}`}</Text>
          </View>
          <Button title="Unblock" variant="secondary" size="compact" onPress={() => void unblock(b)} />
        </View>
      ))}
      {error ? (
        <Text tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </Section>
  );
}
