// @vitest-environment jsdom
import React from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { guardMutations, pendingWriteCount, UnloadGuard } from './pending-writes';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const unloadIsBlocked = () => {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

describe('pending writes (EXEC-01)', () => {
  it('warns before unload only while a write is in flight', async () => {
    render(<UnloadGuard />);
    const d = deferred<string>();
    const m = guardMutations({ save: (_: { id: string }) => d.promise });
    expect(unloadIsBlocked()).toBe(false);

    let call!: Promise<string>;
    act(() => {
      call = m.save({ id: 'a' });
    });
    expect(pendingWriteCount()).toBe(1);
    expect(unloadIsBlocked()).toBe(true);

    await act(async () => {
      d.resolve('ok');
      await call;
    });
    expect(pendingWriteCount()).toBe(0);
    expect(unloadIsBlocked()).toBe(false);
  });

  it('releases the guard when a write fails, and passes results through', async () => {
    const d = deferred<string>();
    const m = guardMutations({ save: () => d.promise });
    const call = m.save();
    expect(pendingWriteCount()).toBe(1);
    d.reject(new Error('network'));
    await expect(call).rejects.toThrow('network');
    expect(pendingWriteCount()).toBe(0);
  });
});
