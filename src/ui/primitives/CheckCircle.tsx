'use client';

import * as React from 'react';
import { clsx } from 'clsx';
import { Check } from 'lucide-react';

export interface CheckCircleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked?: boolean;
  label: string;
  kind?: 'task' | 'routine';
}

export const CheckCircle = React.forwardRef<HTMLButtonElement, CheckCircleProps>(
  ({ className, checked = false, label, kind = 'task', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="button"
        aria-pressed={checked}
        aria-label={label}
        className={clsx(
          'flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          className
        )}
        {...props}
      >
        <div
          className={clsx(
            'flex h-[28px] w-[28px] items-center justify-center rounded-full border-2 transition-colors',
            checked
              ? 'border-accent bg-accent text-accent-ink'
              : 'border-rule-strong bg-surface hover:border-accent text-transparent'
          )}
        >
          {kind === 'task' ? (
            <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
          ) : (
            <span className="text-xs font-bold" aria-hidden="true">↻</span>
          )}
        </div>
      </button>
    );
  }
);
CheckCircle.displayName = 'CheckCircle';
