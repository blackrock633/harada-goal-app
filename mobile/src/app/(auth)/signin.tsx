import { Link } from 'expo-router';
import { useRef, useState } from 'react';

import { signIn } from '@/data/auth';
import { errorMessage } from '@/data/errors';
import { Button, Screen, Text, TextField } from '@/ui';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const inFlight = useRef(false);

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const res = await signIn({ email, password });
      // Success needs no navigation: the session change swaps the route groups.
      if (!res.ok) {
        setFieldErrors(res.error.fieldErrors ?? {});
        setFormError(res.error.fieldErrors ? null : errorMessage(res.error));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen footer={<Button title="Sign in" loading={busy} onPress={submit} />}>
      <Text variant="display">Welcome back</Text>
      <Text tone="muted">Sign in to continue with your goal.</Text>
      {formError ? (
        <Text tone="danger" accessibilityRole="alert">
          {formError}
        </Text>
      ) : null}
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
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
      />
      <Link href="/signup" accessibilityRole="link" accessibilityLabel="Go to create account" style={{ minHeight: 44 }}>
        <Text tone="accent">New here? Create an account</Text>
      </Link>
    </Screen>
  );
}
