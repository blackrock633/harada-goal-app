import * as SecureStore from 'expo-secure-store';

/**
 * Storage adapter for the Supabase client that keeps the session ONLY in the platform keychain
 * (iOS Keychain / Android Keystore-encrypted prefs) — never AsyncStorage, SQLite or files.
 *
 * Some iOS releases reject keychain values over ~2 KB and a Supabase session (access + refresh
 * token + user) can exceed that, so values are split into chunks:
 *   `<key>.n` = number of chunks, `<key>.0` … `<key>.<n-1>` = the parts.
 * A session with a missing part is treated as absent (signed out), never partially trusted.
 */
export const CHUNK_SIZE = 1800; // characters; tokens are ASCII, so this stays under 2 KB

// SecureStore keys may only contain alphanumerics, '.', '-' and '_'.
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');
const countKey = (key: string) => `${safe(key)}.n`;
const partKey = (key: string, i: number) => `${safe(key)}.${i}`;

async function readCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key));
  const n = raw === null ? 0 : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

async function deleteParts(key: string, from: number, to: number): Promise<void> {
  for (let i = from; i < to; i++) await SecureStore.deleteItemAsync(partKey(key, i));
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const n = await readCount(key);
    if (n === 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(partKey(key, i));
      if (part === null) {
        // Corrupt/partial session: clear it rather than hand back a truncated token.
        await secureSessionStorage.removeItem(key);
        return null;
      }
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const previous = await readCount(key);
    const parts: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) parts.push(value.slice(i, i + CHUNK_SIZE));
    if (parts.length === 0) parts.push('');
    for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(partKey(key, i), parts[i]!);
    await SecureStore.setItemAsync(countKey(key), String(parts.length));
    // A shorter session must not leave stale parts behind.
    if (previous > parts.length) await deleteParts(key, parts.length, previous);
  },

  async removeItem(key: string): Promise<void> {
    const n = await readCount(key);
    await deleteParts(key, 0, n);
    await SecureStore.deleteItemAsync(countKey(key));
  },
};
