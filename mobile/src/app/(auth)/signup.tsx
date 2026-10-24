import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { signUp } from '@/data/auth';
import { errorMessage } from '@/data/errors';
import { deviceTimeZone } from '@/screens/deviceTimeZone';
import { useTheme } from '@/theme';
import { Button, Screen, Text, TextField, useLayout } from '@/ui';

export default function SignUpScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const inFlight = useRef(false);

  const { space } = useTheme();
  const { wide } = useLayout();

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFormError(null);
    setNotice(null);
    setFieldErrors({});
    try {
      const res = await signUp({ email, password, displayName, timeZone: deviceTimeZone() });
      if (!res.ok) {
        setFieldErrors(res.error.fieldErrors ?? {});
        setFormError(res.error.fieldErrors ? null : errorMessage(res.error));
      } else if (res.data.needsEmailConfirmation) {
        setNotice(`We sent a confirmation link to ${email.trim()}. Open it, then sign in.`);
      }
      // Otherwise a session exists and the route groups switch on their own.
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen maxWidth={420}>
      <View style={{ gap: space[4], paddingTop: wide ? space[12] : space[4] }}>
        <View style={{ gap: space[2] }}>
          <Text variant="display" accessibilityRole="header">
            Harada
          </Text>
          <Text tone="muted">
            One goal, eight key areas, sixty-four actions — and today&rsquo;s next step.
          </Text>
        </View>
        <Text variant="title">Create account</Text>
        {notice ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite">
            {notice}
          </Text>
        ) : null}
        {formError ? (
          <Text tone="danger" accessibilityRole="alert">
            {formError}
          </Text>
        ) : null}
        <TextField
          label="Name"
          value={displayName}
          onChangeText={setDisplayName}
          error={fieldErrors.displayName?.[0]}
          autoComplete="name"
          textContentType="name"
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={fieldErrors.email?.[0]}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password?.[0]}
          hint="At least 8 characters."
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={submit}
        />
        <View style={{ gap: space[2] }}>
          <Button title="Create account" loading={busy} onPress={submit} />
          <Button
            title="Already have an account? Sign in"
            variant="ghost"
            accessibilityLabel="Go to sign in"
            onPress={() => router.replace('/signin')}
          />
        </View>
      </View>
    </Screen>
  );
}
