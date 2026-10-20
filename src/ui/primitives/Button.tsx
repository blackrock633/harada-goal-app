'use client';

import * as React from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const getStyles = (variant: ButtonVariant, size: ButtonSize) => {
  const base = 'relative inline-flex items-center justify-center font-medium rounded-[var(--radius-sm)] transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer';
  const sizeClasses = size === 'sm' ? 'h-11 sm:h-8 px-3 text-sm min-w-[44px]' : 'h-11 sm:h-10 px-4 text-base min-w-[44px]';
  
  let variantClasses = '';
  switch (variant) {
    case 'primary': variantClasses = 'bg-accent text-accent-ink hover:bg-accent/90'; break;
    case 'secondary': variantClasses = 'border border-rule-strong bg-surface hover:bg-surface-sunken text-ink'; break;
    case 'ghost': variantClasses = 'bg-transparent hover:bg-surface-sunken text-ink'; break;
    case 'danger': variantClasses = 'bg-danger text-accent-ink hover:bg-danger/90'; break;
  }
  return clsx(base, sizeClasses, variantClasses);
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(getStyles(variant, size), className)}
        disabled={loading || disabled}
        aria-busy={loading}
        {...props}
      >
        {loading && <Loader2 className="absolute h-4 w-4 animate-spin" aria-hidden="true" />}
        {/* opacity (not visibility) keeps the label in the accessibility tree while loading */}
        <span className={clsx('inline-flex items-center', loading && 'opacity-0')}>{children}</span>
      </button>
    );
  }
);
Button.displayName = 'Button';

export interface ButtonLinkProps extends React.ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}

export const ButtonLink = React.forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    return (
      <Link ref={ref} className={clsx(getStyles(variant, size), className)} {...props}>
        {children}
      </Link>
    );
  }
);
ButtonLink.displayName = 'ButtonLink';
