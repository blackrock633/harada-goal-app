'use client';

import * as React from 'react';

/**
 * EXEC-01: optimistic UI shows a change before the server confirms it. If the page unloads while
 * that write is in flight (reload, pull-to-refresh, closing the tab), the browser can cancel the
 * request — Safari does — and the user leaves believing it was saved. Every client mutation is
 * routed through `trackWrite`, and while any are pending the page asks before unloading.
 * (Next's fetch-based server actions cannot use `keepalive`, so a warning is the honest remedy.)
 */
let inFlight = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function pendingWriteCount(): number {
  return inFlight;
}

export async function trackWrite<T>(write: Promise<T>): Promise<T> {
  inFlight += 1;
  notify();
  try {
    return await write;
  } finally {
    inFlight -= 1;
    notify();
  }
}

/** Wrap every function of a mutation bag so each call is tracked. */
export function guardMutations<M extends Record<string, (...args: never[]) => Promise<unknown>>>(mutations: M): M {
  const out = {} as Record<string, unknown>;
  for (const [name, fn] of Object.entries(mutations)) {
    out[name] = (...args: never[]) => trackWrite(fn(...args));
  }
  return out as M;
}

export function subscribePendingWrites(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePendingWriteCount(): number {
  return React.useSyncExternalStore(subscribePendingWrites, pendingWriteCount, () => 0);
}

/** Mounted once (in the app shell): warns before unload while any write is unconfirmed. */
export function UnloadGuard(): null {
  const count = usePendingWriteCount();
  React.useEffect(() => {
    if (count === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // required by some browsers to show the prompt
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [count]);
  return null;
}
