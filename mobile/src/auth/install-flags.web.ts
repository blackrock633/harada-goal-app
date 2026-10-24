/**
 * Web build (design preview and browser QA only): expo-sqlite's kv-store needs a wasm worker on
 * web, so install flags live in localStorage instead. Native builds use install-flags.ts.
 */
export const installFlags = {
  async getItem(key: string): Promise<string | null> {
    return globalThis.localStorage?.getItem(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    globalThis.localStorage?.setItem(key, value);
  },
};
