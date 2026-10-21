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
/** Max UTF-8 bytes per keychain item. The session JSON includes user metadata (e.g. a display
 * name in Japanese or with emoji), so chunks are measured in bytes, not characters (NAT-02). */
export const CHUNK_BYTES = 1800;

const utf8Length = (codePoint: number) =>
  codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;

/** Split into parts of at most CHUNK_BYTES UTF-8 bytes, never inside a character. */
export function splitUtf8(value: string, maxBytes = CHUNK_BYTES): string[] {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of value) {
    const size = utf8Length(char.codePointAt(0)!);
    if (bytes + size > maxBytes) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts;
}

// SecureStore keys may only contain alphanumerics, '.', '-' and '_'.
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');
const countKey = (key: string) => `${safe(key)}.n`;
const partKey = (key: string, i: number) => `${safe(key)}.${i}`;

async function readCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key));
  const n = raw === null ? 0 : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Delete parts from index `from`: always through `through - 1` (the recorded count, so a gap in
 * the middle can't stop cleanup), then onward while parts still exist (orphans left beyond the
 * count by an interrupted write). No stale token fragment lingers in the keychain. */
async function sweepParts(key: string, from: number, through = 0): Promise<void> {
  for (let i = from; i < through || (await SecureStore.getItemAsync(partKey(key, i))) !== null; i++) {
    await SecureStore.deleteItemAsync(partKey(key, i));
  }
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
    const parts = splitUtf8(value);
    // Invalidate first, publish the count last: an interrupted write reads as signed out instead
    // of splicing old and new parts together.
    await SecureStore.setItemAsync(countKey(key), '0');
    for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(partKey(key, i), parts[i]!);
    await SecureStore.setItemAsync(countKey(key), String(parts.length));
    // A shorter session (or an earlier interrupted write) must not leave stale parts behind.
    await sweepParts(key, parts.length);
  },

  async removeItem(key: string): Promise<void> {
    await sweepParts(key, 0, await readCount(key));
    await SecureStore.deleteItemAsync(countKey(key));
  },
};
