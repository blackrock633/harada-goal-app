/// <reference path="./node_modules/expo-router/build/ts-declarations/expect.d.ts" />
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
