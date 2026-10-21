import { Redirect } from 'expo-router';

import { useSession } from '@/auth/session';

// Signed-in users land on Today (the daily execution screen); everyone else on sign in.
export default function Index() {
  const session = useSession();
  return <Redirect href={session.status === 'signedIn' ? '/today' : '/signin'} />;
}
