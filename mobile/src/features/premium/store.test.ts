import { Platform } from 'react-native';
import { loadStorePackages, purchaseStorePackage, restoreStorePurchases } from './store';
const mockPurchase = jest.fn(async (_p: unknown) => ({}));
const mockRestore = jest.fn(async () => ({}));
const mockConfigure = jest.fn();
const mockLogin = jest.fn(async (_s: string) => ({}));
const mockSync = jest.fn(async (..._a: unknown[]) => ({ ok: true, data: { synchronized: true } }));
let mockUser = 'one';
let mockIdentity = 'private-one';
let mockPlan = 'free';
const mockPack = {
  identifier: 'monthly',
  packageType: 'MONTHLY',
  product: { identifier: 'pro.month', priceString: '$3.99', price: 3.99, currencyCode: 'USD' },
};
jest.mock(
  'react-native-purchases',
  () => ({
    default: {
      configure: (...a: unknown[]) => mockConfigure(...a),
      getAppUserID: async () => 'private-one',
      logIn: (s: string) => mockLogin(s),
      getOfferings: async () => ({ current: { availablePackages: [mockPack] } }),
      purchasePackage: (p: unknown) => mockPurchase(p),
      restorePurchases: () => mockRestore(),
    },
  }),
  { virtual: true },
);
jest.mock('@/data/supabase', () => ({
  getSupabase: () => ({
    auth: { getUser: async () => ({ data: { user: { id: mockUser } }, error: null }) },
    rpc: async (name: string) => ({
      data: name === 'my_billing_identity' ? mockIdentity : { plan: mockPlan },
      error: null,
    }),
  }),
}));
jest.mock('@/data/premium', () => ({ invokeFunction: (...a: unknown[]) => mockSync(...a) }));
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = 'appl_public';
  mockPlan = 'free';
  mockIdentity = 'private-one';
  mockUser = 'one';
});
it('loads provider prices and uses the private account identity', async () => {
  expect(await loadStorePackages()).toEqual([mockPack]);
  expect(mockConfigure).toHaveBeenCalledWith({ apiKey: 'appl_public', appUserID: 'private-one' });
});
it('purchases then requests server verification, without trusting SDK access', async () => {
  await purchaseStorePackage(mockPack);
  expect(mockPurchase).toHaveBeenCalledWith(mockPack);
  expect(mockSync).toHaveBeenCalledWith('billing-sync', {});
});
it('restores and re-verifies against the authenticated server', async () => {
  await restoreStorePurchases();
  expect(mockRestore).toHaveBeenCalled();
  expect(mockSync).toHaveBeenCalled();
});
it('switches billing identities between Harada accounts', async () => {
  mockUser = 'two';
  mockIdentity = 'private-two';
  await loadStorePackages();
  expect(mockLogin).toHaveBeenCalledWith('private-two');
});
it('does not sell another subscription to an already premium account', async () => {
  mockPlan = 'pro';
  await expect(purchaseStorePackage(mockPack)).rejects.toThrow('already');
  expect(mockPurchase).not.toHaveBeenCalled();
});
it('does not fabricate purchases when keys are missing', async () => {
  delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  await expect(loadStorePackages()).rejects.toThrow('not configured');
  expect(mockPurchase).not.toHaveBeenCalled();
});
