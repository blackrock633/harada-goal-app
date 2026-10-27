import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { AVATAR_MAX_CHARS, JPEG_DATA_URI, POST_IMAGE_MAX_CHARS } from '@shared/application/social';

export type PickedPhoto = { dataUri: string; width: number; height: number };

const PRESETS = {
  /** Square, small: shown at 40–96 pt. */
  avatar: { maxSide: 256, quality: [0.72, 0.58, 0.45], maxChars: AVATAR_MAX_CHARS, aspect: [1, 1] as [number, number] },
  /** Post photo: sharp on a phone, a few hundred KB at most. */
  post: { maxSide: 1280, quality: [0.72, 0.6, 0.48, 0.36], maxChars: POST_IMAGE_MAX_CHARS, aspect: undefined },
} as const;

/**
 * Lets the user pick a photo, then re-encodes it on the device as a downsized JPEG. Re-encoding keeps only
 * the pixels: EXIF metadata (GPS location, camera, time) never leaves the phone. The result is checked
 * against the same JPEG rule the server enforces. Resolves null when the user cancels.
 */
export async function pickPhoto(kind: keyof typeof PRESETS): Promise<PickedPhoto | null> {
  const preset = PRESETS[kind];
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: preset.aspect,
    quality: 1,
    exif: false,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];
  const landscape = (asset.width ?? 0) >= (asset.height ?? 0);
  const resize = landscape ? { width: Math.min(preset.maxSide, asset.width || preset.maxSide) } : { height: Math.min(preset.maxSide, asset.height || preset.maxSide) };

  const rendered = await ImageManipulator.manipulate(asset.uri).resize(resize).renderAsync();
  for (const compress of preset.quality) {
    const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    const dataUri = `data:image/jpeg;base64,${out.base64 ?? ''}`;
    if (JPEG_DATA_URI.test(dataUri) && dataUri.length <= preset.maxChars) {
      return { dataUri, width: out.width, height: out.height };
    }
  }
  throw new Error('PHOTO_TOO_LARGE');
}
