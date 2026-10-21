/// <reference path="./node_modules/expo-router/build/ts-declarations/expect.d.ts" />
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

// jest-expo stubs native modules, so expo-crypto's native randomUUID returns undefined under
// Jest. Back it with Node's implementation so client-id logic is exercised with real UUIDs.
jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  randomUUID: () => require('node:crypto').randomUUID(),
}));
