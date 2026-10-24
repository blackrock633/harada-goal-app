import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { signIn } from '@/data/auth';
import { errorMessage } from '@/data/errors';
import { useTheme } from '@/theme';
import { Button, Screen, Text, TextField, useLayout } from '@/ui';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const inFlight = useRef(false);

  const { space } = useTheme();
  const { wide } = useLayout();

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
        <Text variant="title">Sign in</Text>
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
        <View style={{ gap: space[2] }}>
          <Button title="Sign in" loading={busy} onPress={submit} />
          <Button
            title="New here? Create an account"
            variant="ghost"
            accessibilityLabel="Go to create account"
            onPress={() => router.replace('/signup')}
          />
        </View>
      </View>
    </Screen>
  );
}
