import { CHUNK_SIZE, secureSessionStorage } from '../secure-session-storage';

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
}));

const KEY = 'sb-projectref-auth-token';
const session = (len: number) => JSON.stringify({ access_token: 'a'.repeat(len), refresh_token: 'r'.repeat(40) });

beforeEach(() => mockKeychain.clear());

describe('secureSessionStorage', () => {
  it('round-trips a session larger than one mockKeychain item', async () => {
    const value = session(5000);
    await secureSessionStorage.setItem(KEY, value);
    expect(await secureSessionStorage.getItem(KEY)).toBe(value);
    expect([...mockKeychain.values()].every((v) => v.length <= CHUNK_SIZE)).toBe(true);
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
