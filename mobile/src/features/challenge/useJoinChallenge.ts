import { useCallback, useRef, useState } from 'react';

import { errorMessage, newClientId } from '@/data/errors';
import { joinChallenge } from '@/data/premium';

/**
 * Join with one client id per attempt: a double tap is dropped while a call is in flight, and a retry
 * after a failure reuses the id, so the server (idempotent on it) never creates a second enrollment.
 * A different goal is a different attempt and gets a fresh id.
 */
export function useJoinChallenge(onJoined: (row: { id: string }) => void) {
  const attempt = useRef<{ id: string; goalId: string } | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = useCallback(
    async (goalId: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      if (!attempt.current || attempt.current.goalId !== goalId) attempt.current = { id: newClientId(), goalId };
      try {
        const res = await joinChallenge(attempt.current.id, goalId);
        if (res.ok) onJoined(res.data);
        else setError(errorMessage(res.error));
      } catch {
        setError(errorMessage({ code: 'UNAVAILABLE', message: '' }));
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [onJoined],
  );

  return { join, busy, error };
}
