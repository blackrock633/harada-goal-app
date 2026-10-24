import { ShipporiMinchoB1_500Medium, ShipporiMinchoB1_700Bold } from '@expo-google-fonts/shippori-mincho-b1';
import { useFonts } from 'expo-font';

/** Only the display face is bundled; UI text uses the platform face (SF / Roboto). */
export const fontAssets = {
  ShipporiMinchoB1_500Medium,
  ShipporiMinchoB1_700Bold,
};

/** Loads the display face. `ready` is true when loaded or when loading failed (system serif fallback). */
export function useAppFonts(): { ready: boolean; error: Error | null } {
  const [loaded, error] = useFonts(fontAssets);
  return { ready: loaded || error != null, error };
}
