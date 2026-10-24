/**
 * Web build (design preview and browser QA only): there is no keychain in a browser, so the
 * Supabase session lives in localStorage, as supabase-js does by default on web. Native builds
 * use secure-session-storage.ts, which keeps the session only in the platform keychain.
 */
export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    return globalThis.localStorage?.getItem(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    globalThis.localStorage?.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    globalThis.localStorage?.removeItem(key);
  },
};
