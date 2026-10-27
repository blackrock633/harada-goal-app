import { useRef, useState } from 'react';

import { errorMessage } from '@/data/errors';
import { followUser, unfollowUser, useInvalidateSocial } from '@/data/social';
import { Button } from '@/ui';

/** Follow / Following. Optimistic, rolled back on failure; a second tap during a request is ignored. */
export function FollowButton({ userId, following, name, onError }: { userId: string; following: boolean; name: string; onError?: (m: string) => void }) {
  const [on, setOn] = useState(following);
  const busy = useRef(false);
  const invalidate = useInvalidateSocial();
  async function toggle() {
    if (busy.current) return;
    busy.current = true;
    const next = !on;
    setOn(next);
    const res = next ? await followUser(userId) : await unfollowUser(userId);
    busy.current = false;
    if (!res.ok) {
      setOn(!next);
      onError?.(errorMessage(res.error));
      return;
    }
    void invalidate();
  }
  return (
    <Button
      title={on ? 'Following' : 'Follow'}
      variant={on ? 'secondary' : 'primary'}
      size="compact"
      accessibilityLabel={on ? `Unfollow ${name}` : `Follow ${name}`}
      onPress={() => void toggle()}
    />
  );
}
