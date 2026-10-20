'use client';

import * as React from 'react';
import { clsx } from 'clsx';
import { ButtonVariant, ButtonSize } from './Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label: string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = 'ghost', size = 'md', label, children, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center rounded-[var(--radius-sm)] transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer';
    const sizeClasses = size === 'sm' ? 'h-[32px] w-[32px] min-w-[44px] min-h-[44px] md:min-w-[32px] md:min-h-[32px]' : 'h-[40px] w-[40px] min-w-[44px] min-h-[44px]';
    
    let variantClasses = '';
    switch (variant) {
      case 'primary': variantClasses = 'bg-accent text-accent-ink hover:bg-accent/90'; break;
      case 'secondary': variantClasses = 'border border-rule-strong bg-surface hover:bg-surface-sunken text-ink'; break;
      case 'ghost': variantClasses = 'bg-transparent hover:bg-surface-sunken text-ink'; break;
      case 'danger': variantClasses = 'bg-danger text-accent-ink hover:bg-danger/90'; break;
    }

    return (
      <button
        ref={ref}
        className={clsx(base, sizeClasses, variantClasses, className)}
        aria-label={label}
        title={label}
        {...props}
      >
        {children}
      </button>
    );
  }
);
IconButton.displayName = 'IconButton';
