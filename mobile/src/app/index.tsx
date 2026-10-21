import { Redirect } from 'expo-router';

// No auth logic yet: land on the first tab.
export default function Index() {
  return <Redirect href="/today" />;
}
