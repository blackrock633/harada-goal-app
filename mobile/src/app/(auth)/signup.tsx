import { Link } from 'expo-router';
import { useRef, useState } from 'react';

import { signUp } from '@/data/auth';
import { errorMessage } from '@/data/errors';
import { deviceTimeZone } from '@/screens/deviceTimeZone';
import { Button, Screen, Text, TextField } from '@/ui';

export default function SignUpScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const inFlight = useRef(false);

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
    <Screen footer={<Button title="Create account" loading={busy} onPress={submit} />}>
      <Text variant="display">Start your goal</Text>
      <Text tone="muted">Create an account to keep your plan in sync.</Text>
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
      <Link href="/signin" accessibilityRole="link" accessibilityLabel="Go to sign in" style={{ minHeight: 44 }}>
        <Text tone="accent">Already have an account? Sign in</Text>
      </Link>
    </Screen>
  );
}
