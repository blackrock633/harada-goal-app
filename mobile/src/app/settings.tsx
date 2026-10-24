import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useSession } from '@/auth/session';
import { signOut } from '@/data/auth';
import { errorMessage } from '@/data/errors';
import { useProfile } from '@/data/hooks';
import { deleteAccount } from '@/screens/deleteAccount';
import { Button, ListRow, Screen, Section, Text, TextField } from '@/ui';

export default function SettingsScreen() {
  const session = useSession();
  const profile = useProfile();
  const email = session.status === 'signedIn' ? session.session?.user?.email : undefined;
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      // The session change unmounts this screen (Stack.Protected), so nothing else to do.
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <Screen>
      <Section title="Account" ruled={false}>
        <View>
          <ListRow title="Name" meta={profile.data?.displayName ?? '—'} />
          <ListRow title="Email" meta={email ?? '—'} divider={false} />
        </View>
        <View style={{ alignItems: 'flex-start' }}>
          <Button title="Sign out" variant="secondary" loading={signingOut} onPress={handleSignOut} />
        </View>
      </Section>
      <Section
        title="Time zone"
        description="Decides when your day starts and what counts as today."
      >
        <Text tabular>{profile.data?.timeZone ?? '—'}</Text>
      </Section>
      <DeleteAccount />
    </Screen>
  );
}

function DeleteAccount() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const inFlight = useRef(false);

  async function submit() {
    if (inFlight.current) return;
    setFormError(null);
    const local: Record<string, string[]> = {};
    if (!password) local.password = ['Required'];
    if (confirmation !== 'DELETE') local.confirmation = ['Type DELETE to confirm'];
    setFieldErrors(local);
    if (Object.keys(local).length > 0) return;

    inFlight.current = true;
    setBusy(true);
    try {
      const res = await deleteAccount(password, confirmation);
      if (res.ok) {
        await signOut();
        return;
      }
      setFieldErrors(res.error.fieldErrors ?? {});
      setFormError(res.error.fieldErrors ? null : errorMessage(res.error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title="Delete account">
      <Text tone="muted">
        This permanently deletes your account and all of your goals, plans and reflections. It
        cannot be undone.
      </Text>
      {formError ? (
        <Text tone="danger" accessibilityRole="alert">
          {formError}
        </Text>
      ) : null}
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={fieldErrors.password?.[0]}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
      />
      <TextField
        label="Type DELETE to confirm"
        value={confirmation}
        onChangeText={setConfirmation}
        error={fieldErrors.confirmation?.[0]}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <View style={{ alignItems: 'flex-start' }}>
        <Button title="Delete account" variant="danger" loading={busy} onPress={submit} />
      </View>
    </Section>
  );
}
