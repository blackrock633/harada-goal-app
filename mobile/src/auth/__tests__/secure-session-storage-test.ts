import { CHUNK_BYTES, secureSessionStorage, splitUtf8 } from '../secure-session-storage';

// In-memory stand-in for the platform mockKeychain.
const mockKeychain = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockKeychain.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    if (!/^[A-Za-z0-9._-]+$/.test(k)) throw new Error(`invalid SecureStore key ${k}`);
    if (v.length > 2048) throw new Error('value too large for mockKeychain');
    mockKeychain.set(k, v);
  }),
  deleteItemAsync: jest.fn(async (k: string) => void mockKeychain.delete(k)),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

const KEY = 'sb-projectref-auth-token';
const session = (len: number) => JSON.stringify({ access_token: 'a'.repeat(len), refresh_token: 'r'.repeat(40) });

beforeEach(() => mockKeychain.clear());

describe('secureSessionStorage', () => {
  it('round-trips a session larger than one mockKeychain item', async () => {
    const value = session(5000);
    await secureSessionStorage.setItem(KEY, value);
    expect(await secureSessionStorage.getItem(KEY)).toBe(value);
    expect([...mockKeychain.values()].every((v) => Buffer.byteLength(v, 'utf8') <= CHUNK_BYTES)).toBe(true);
    expect(mockKeychain.size).toBeGreaterThan(3);
  });

  it('returns null when nothing is stored', async () => {
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });

  it('leaves no stale parts when the session shrinks', async () => {
    await secureSessionStorage.setItem(KEY, session(6000));
    const small = session(10);
    await secureSessionStorage.setItem(KEY, small);
    expect(await secureSessionStorage.getItem(KEY)).toBe(small);
    expect(mockKeychain.size).toBe(2); // one part + the count
  });

  it('sign-out removes every part', async () => {
    await secureSessionStorage.setItem(KEY, session(6000));
    await secureSessionStorage.removeItem(KEY);
    expect(mockKeychain.size).toBe(0);
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });

  it('treats a partially missing session as signed out and clears it', async () => {
    await secureSessionStorage.setItem(KEY, session(5000));
    mockKeychain.delete(`${KEY}.1`);
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
    expect(mockKeychain.size).toBe(0);
  });

  it('sanitises keys the mockKeychain would reject', async () => {
    await secureSessionStorage.setItem('sb:weird/key', 'x');
    expect(await secureSessionStorage.getItem('sb:weird/key')).toBe('x');
  });
});

describe('non-ASCII sessions (NAT-02)', () => {
  it('no keychain item exceeds 2048 UTF-8 bytes with a non-ASCII display name', async () => {
    const value = JSON.stringify({
      access_token: 'a'.repeat(900),
      refresh_token: 'r'.repeat(40),
      user: { user_metadata: { display_name: '原田 隆史 — 目標達成の技術 🎯'.repeat(40) } },
    });
    await secureSessionStorage.setItem('sb-proj-auth-token', value);
    for (const [k, v] of mockKeychain) if (!k.endsWith('.n')) expect(Buffer.byteLength(v, 'utf8')).toBeLessThanOrEqual(2048);
    expect(await secureSessionStorage.getItem('sb-proj-auth-token')).toBe(value);
  });

  it('never splits a multi-byte character', () => {
    const parts = splitUtf8('🎯'.repeat(10), 6); // 4-byte emoji: one per part
    expect(parts).toEqual(Array(10).fill('🎯'));
    expect(parts.join('')).toBe('🎯'.repeat(10));
  });
});

describe('interrupted writes', () => {
  it('reads as signed out if a write dies before publishing the count', async () => {
    await secureSessionStorage.setItem(KEY, session(3000));
    const store = jest.requireMock('expo-secure-store') as { setItemAsync: jest.Mock };
    let writes = 0;
    store.setItemAsync.mockImplementationOnce(async (k: string, v: string) => {
      writes++;
      mockKeychain.set(k, v); // count := '0'
    });
    store.setItemAsync.mockImplementationOnce(async () => {
      throw new Error('app killed');
    });
    await expect(secureSessionStorage.setItem(KEY, session(4000))).rejects.toThrow('app killed');
    expect(writes).toBe(1);
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });

  it('sign-out after an interrupted write leaves no orphaned token parts', async () => {
    await secureSessionStorage.setItem(KEY, session(5000));
    const store = jest.requireMock('expo-secure-store') as { setItemAsync: jest.Mock };
    store.setItemAsync.mockImplementationOnce(async (k: string, v: string) => void mockKeychain.set(k, v));
    store.setItemAsync.mockImplementationOnce(async () => {
      throw new Error('app killed');
    });
    await expect(secureSessionStorage.setItem(KEY, session(5000))).rejects.toThrow();
    await secureSessionStorage.removeItem(KEY);
    expect(mockKeychain.size).toBe(0);
  });

  // SEC-MOB-01: session tokens must not migrate to another device through an encrypted iOS backup.
  it('every keychain call is device-only', async () => {
    const SecureStore = jest.requireMock('expo-secure-store');
    await secureSessionStorage.setItem(KEY, session(5000));
    await secureSessionStorage.getItem(KEY);
    await secureSessionStorage.removeItem(KEY);
    for (const fn of [SecureStore.getItemAsync, SecureStore.setItemAsync, SecureStore.deleteItemAsync]) {
      expect(fn.mock.calls.length).toBeGreaterThan(0);
      for (const call of fn.mock.calls) expect(call[call.length - 1]).toEqual({ keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' });
    }
  });
});
