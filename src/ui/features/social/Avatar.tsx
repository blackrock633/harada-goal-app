'use client';

import * as React from 'react';
import { clsx } from 'clsx';

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

export function readImageFileAsDataUrl(file: File, maxBytes = 240 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
      reject(new Error('Use a PNG, JPEG, or WebP image file.'));
      return;
    }
    if (file.size > maxBytes) {
      const kb = Math.round(maxBytes / 1024);
      reject(new Error(`Image must be under ${kb} KB.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(result)) {
        reject(new Error('Invalid image file contents.'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}
