import { signIn, signOut, signUp } from '../auth';
import { authErrorToAppError } from '../auth-errors';
import { readSupabaseEnv, SESSION_STORAGE_KEY } from '../supabase';

const mockKeychain = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockKeychain.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockKeychain.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockKeychain.delete(k)),
}));

const mockAuth = {
  signInWithPassword: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(),
};
jest.mock('../supabase', () => ({
  ...jest.requireActual('../supabase'),
  getSupabase: () => ({ auth: mockAuth }),
}));

const USER = { id: '11111111-1111-4111-8111-111111111111' };

beforeEach(() => {
  mockKeychain.clear();
  jest.clearAllMocks();
});

describe('signIn', () => {
  it('validates with the shared schema before calling Supabase', async () => {
    const r = await signIn({ email: 'not-an-email', password: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.fieldErrors?.email).toBeDefined();
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('returns the user id on success', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: USER, session: {} }, error: null });
    expect(await signIn({ email: 'a@b.co', password: 'secret' })).toEqual({ ok: true, data: { userId: USER.id } });
  });

  it('uses the web wording for wrong credentials', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { code: 'invalid_credentials', status: 400 } });
    expect(await signIn({ email: 'a@b.co', password: 'nope' })).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: 'Email or password is incorrect' },
    });
  });

  it('reports a thrown request as UNAVAILABLE', async () => {
    mockAuth.signInWithPassword.mockRejectedValue(new TypeError('Network request failed'));
    const r = await signIn({ email: 'a@b.co', password: 'secret' });
    expect(!r.ok && r.error.code).toBe('UNAVAILABLE');
  });
});

describe('signUp', () => {
  it('sends display name and time zone as the metadata the profile trigger reads', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: USER, session: null }, error: null });
    const r = await signUp({ email: 'a@b.co', password: 'longenough', displayName: 'Ann', timeZone: 'Asia/Tokyo' });
    expect(mockAuth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: { data: { display_name: 'Ann', time_zone: 'Asia/Tokyo' } } }),
    );
    expect(r).toEqual({ ok: true, data: { userId: USER.id, needsEmailConfirmation: true } });
  });

  it('maps a taken email to CONFLICT', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: null }, error: { code: 'user_already_exists', status: 422 } });
    const r = await signUp({ email: 'a@b.co', password: 'longenough', displayName: 'Ann', timeZone: 'UTC' });
    expect(!r.ok && r.error.code).toBe('CONFLICT');
  });
});

describe('signOut', () => {
  const storeSession = () => {
    mockKeychain.set(`${SESSION_STORAGE_KEY}.n`, '2');
    mockKeychain.set(`${SESSION_STORAGE_KEY}.0`, 'part-a');
    mockKeychain.set(`${SESSION_STORAGE_KEY}.1`, 'part-b');
  };

  it('clears every keychain chunk', async () => {
    storeSession();
    mockAuth.signOut.mockResolvedValue({ error: null });
    expect(await signOut()).toEqual({ ok: true, data: null });
    expect(mockKeychain.size).toBe(0);
  });

  it('still clears the keychain when the server call fails (offline)', async () => {
    storeSession();
    mockAuth.signOut.mockRejectedValue(new TypeError('Network request failed'));
    await signOut();
    expect(mockKeychain.size).toBe(0);
  });
});

describe('authErrorToAppError', () => {
  it.each([
    [{ code: 'email_not_confirmed' }, 'UNAUTHENTICATED'],
    [{ code: 'weak_password' }, 'VALIDATION'],
    [{ status: 429 }, 'RATE_LIMITED'],
    [{ name: 'AuthRetryableFetchError', status: 0 }, 'UNAVAILABLE'],
    [{ status: 503 }, 'UNAVAILABLE'],
    [{ code: 'something_new', status: 400 }, 'INTERNAL'],
  ])('%j → %s', (err, code) => {
    expect(authErrorToAppError(err).code).toBe(code);
  });
});

describe('readSupabaseEnv', () => {
  it('fails closed without configuration', () => {
    expect(readSupabaseEnv({})).toBeNull();
    expect(readSupabaseEnv({ EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
  });
  it('prefers the publishable key over the anon key', () => {
    expect(
      readSupabaseEnv({
        EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pub',
      }),
    ).toEqual({ url: 'https://x.supabase.co', anonKey: 'pub' });
  });
});
