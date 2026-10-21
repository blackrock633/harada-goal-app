import { Fraunces_400Regular, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';

export const fontAssets = {
  Fraunces_400Regular,
  Fraunces_600SemiBold,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
};

/** Loads Fraunces + Inter. `ready` is true when loaded or when loading failed (system font fallback). */
export function useAppFonts(): { ready: boolean; error: Error | null } {
  const [loaded, error] = useFonts(fontAssets);
  return { ready: loaded || error != null, error };
}
