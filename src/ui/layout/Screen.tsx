import * as React from 'react';
import { clsx } from 'clsx';

export interface ScreenProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `default` = 1120px, `reading` = 720px. */
  width?: 'default' | 'reading';
}

export function Screen({ width = 'default', className, ...props }: ScreenProps) {
  return (
    <div
      className={clsx(
        'mx-auto w-full min-w-0 px-4 py-6 md:px-8 md:py-8',
        width === 'reading' ? 'max-w-[720px]' : 'max-w-[1120px]',
        className
      )}
      {...props}
    />
  );
}
