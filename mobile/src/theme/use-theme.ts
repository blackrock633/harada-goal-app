import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from './tokens';

/** Returns the token set matching the system colour scheme. */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
