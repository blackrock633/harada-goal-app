'use client';

import * as React from 'react';
import { clsx } from 'clsx';
import { AVATAR_MAX_CHARS, JPEG_DATA_URI, POST_IMAGE_MAX_CHARS } from '@/application/social';

export interface AvatarProps {
  displayName: string;
  username?: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
};

function initialsOf(displayName: string, username?: string): string {
  const source = displayName.trim() || username?.trim() || '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function Avatar({ displayName, username, avatarUrl, size = 'md', className }: AvatarProps) {
  const [imgFailed, setImgFailed] = React.useState(false);

  React.useEffect(() => {
    setImgFailed(false);
  }, [avatarUrl]);

  const showImg = Boolean(avatarUrl && !imgFailed);

  return (
    <div
      className={clsx(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-rule bg-accent-soft font-serif font-medium text-ink',
        SIZE_CLASSES[size],
        className,
      )}
      aria-label={`${displayName} avatar`}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl!}
          alt={displayName}
          className="h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initialsOf(displayName, username)}</span>
      )}
    </div>
  );
}

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
/** Raw files above this are refused before decoding (the result is far smaller after re-encoding). */
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const PRESETS = {
  avatar: { maxSide: 256, quality: [0.72, 0.58, 0.45], maxChars: AVATAR_MAX_CHARS },
  post: { maxSide: 1280, quality: [0.72, 0.6, 0.48, 0.36], maxChars: POST_IMAGE_MAX_CHARS },
} as const;

/**
 * Decodes the chosen file in the browser and re-encodes it as a downsized JPEG data URI. Only pixels
 * survive: EXIF metadata (GPS location, camera, time) and anything appended to the file are dropped, and a
 * file that is not really an image fails to decode. The result matches the rule the server enforces.
 */
export async function readImageFileAsDataUrl(file: File, kind: keyof typeof PRESETS): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) throw new Error('Use a PNG, JPEG, or WebP image file.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That image is too large.');
  const preset = PRESETS[kind];
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('That file isn’t an image we can read.');
  }
  const scale = Math.min(1, preset.maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const q of preset.quality) {
    const dataUri = canvas.toDataURL('image/jpeg', q);
    if (JPEG_DATA_URI.test(dataUri) && dataUri.length <= preset.maxChars) return dataUri;
  }
  throw new Error('That image is too large.');
}
