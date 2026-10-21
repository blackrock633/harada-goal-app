import { Link } from 'expo-router';
import { useState } from 'react';

import { Button, Screen, Text, TextField } from '@/ui';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <Screen footer={<Button title="Create account" onPress={() => {}} />}>
      <Text variant="display">Start your goal</Text>
      <Text tone="muted">Create an account to keep your plan in sync.</Text>
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        hint="At least 8 characters."
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Link href="/signin" accessibilityRole="link" accessibilityLabel="Go to sign in" style={{ minHeight: 44 }}>
        <Text tone="accent">Already have an account? Sign in</Text>
      </Link>
    </Screen>
  );
}
