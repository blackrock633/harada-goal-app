import { Link } from 'expo-router';
import { useState } from 'react';

import { Button, Screen, Text, TextField } from '@/ui';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <Screen footer={<Button title="Sign in" onPress={() => {}} />}>
      <Text variant="display">Welcome back</Text>
      <Text tone="muted">Sign in to continue with your goal.</Text>
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
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
      />
      <Link href="/signup" accessibilityRole="link" accessibilityLabel="Go to create account" style={{ minHeight: 44 }}>
        <Text tone="accent">New here? Create an account</Text>
      </Link>
    </Screen>
  );
}
