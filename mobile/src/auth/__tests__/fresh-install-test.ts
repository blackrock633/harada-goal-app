import { clearSessionIfFreshInstall } from '../session';

jest.mock('expo-sqlite/kv-store', () => ({ __esModule: true, default: {} }));
jest.mock('@/data/supabase', () => ({ SESSION_STORAGE_KEY: 'k', SupabaseNotConfiguredError: class extends Error {}, getSupabase: jest.fn() }));

function memoryFlags(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: async (k: string) => m.get(k) ?? null,
    setItem: async (k: string, v: string) => void m.set(k, v),
    map: m,
  };
}

describe('clearSessionIfFreshInstall (NAT-03b)', () => {
  it('drops a keychain session left over from a previous install', async () => {
    const flags = memoryFlags();
    const remove = jest.fn(async () => {});
    expect(await clearSessionIfFreshInstall(flags, remove)).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(flags.map.get('harada.installed')).toBe('1');
  });

  it('keeps the session on every later launch', async () => {
    const flags = memoryFlags({ 'harada.installed': '1' });
    const remove = jest.fn(async () => {});
    expect(await clearSessionIfFreshInstall(flags, remove)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it('marks the install only after the session is gone', async () => {
    const flags = memoryFlags();
    const remove = jest.fn(async () => {
      throw new Error('keychain locked');
    });
    await expect(clearSessionIfFreshInstall(flags, remove)).rejects.toThrow();
    expect(flags.map.has('harada.installed')).toBe(false); // retried next launch
  });
});
