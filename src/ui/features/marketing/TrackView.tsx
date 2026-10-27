'use client';

import * as React from 'react';
import { attributionSource, VISITOR_ID_RE, type BrowserEvent } from '@/application/web-public';

const VISITOR_KEY = 'harada.visitor';

/** A random per-browser visitor id (never derived from personal data). Falls back to a per-page id. */
function visitorId(): string {
  const fresh = () => crypto.randomUUID().replace(/-/g, '');
  try {
    const stored = window.localStorage.getItem(VISITOR_KEY);
    if (stored && VISITOR_ID_RE.test(stored)) return stored;
    const id = fresh();
    window.localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return fresh();
  }
}

/**
 * Records one page view through a server action (the browser never talks to Supabase directly). Props are
 * limited to {source}: 'referral' for a valid ?ref, else a utm_source token. Renders nothing.
 */
export function TrackView({
  name,
  track,
}: {
  name: BrowserEvent;
  track: (name: BrowserEvent, props: { source?: string }, visitorId: string) => Promise<void>;
}) {
  const sent = React.useRef(false);
  React.useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    try {
      const q = new URLSearchParams(window.location.search);
      const source = attributionSource({ ref: q.get('ref'), utmSource: q.get('utm_source') });
      void track(name, source ? { source } : {}, visitorId()).catch(() => undefined);
    } catch {
      // Analytics never affects the page.
    }
  }, [name, track]);
  return null;
}
