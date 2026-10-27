/// <reference path="./node_modules/expo-router/build/ts-declarations/expect.d.ts" />
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

// jest-expo stubs native modules, so expo-crypto's native randomUUID returns undefined under
// Jest. Back it with Node's implementation so client-id logic is exercised with real UUIDs.
jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  randomUUID: () => require('node:crypto').randomUUID(),
}));

// The page swipe (app/(tabs)/_layout.tsx) uses gesture-handler v3 hooks, which need a native Reanimated
// runtime. Screens under test only need the detector to render its child; swiping is checked on a device.
jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  usePanGesture: () => ({}),
  GestureDetector: ({ children }: { children: unknown }) => children,
}));
