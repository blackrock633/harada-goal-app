'use client';

import * as React from 'react';

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * HYD-01: a server-rendered field accepts typing before React hydrates. A controlled field's state
 * starts from its initial value and never reads the DOM, so that text would be dropped on the next
 * render. On mount, if the DOM holds a different value than the controlled `value`, report it through
 * the field's own onChange so the owner's state adopts what the user typed. No-op for client-only
 * mounts (DOM and state already agree) and for uncontrolled fields.
 */
export function useAdoptPrehydrationValue<T extends Control>(
  forwardedRef: React.ForwardedRef<T>,
  value: unknown,
  onChange: ((e: React.ChangeEvent<T>) => void) | undefined,
): React.RefCallback<T> {
  const node = React.useRef<T | null>(null);
  const latest = React.useRef({ value, onChange });
  latest.current = { value, onChange };

  React.useLayoutEffect(() => {
    const el = node.current;
    const { value: controlled, onChange: handler } = latest.current;
    if (!el || controlled === undefined || !handler) return;
    if (el.value !== String(controlled ?? '')) {
      handler({ target: el, currentTarget: el } as React.ChangeEvent<T>);
    }
  }, []);

  return React.useCallback(
    (el: T | null) => {
      node.current = el;
      if (typeof forwardedRef === 'function') forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    },
    [forwardedRef],
  );
}
