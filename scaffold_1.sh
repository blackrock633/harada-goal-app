#!/bin/bash
set -e

mkdir -p src/ui/primitives src/ui/shell src/app/\(dev\)/styleguide

cat << 'EOF' > src/ui/primitives/Button.tsx
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
  const base = 'inline-flex items-center justify-center font-medium rounded-[var(--radius-sm)] transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer';
  const sizeClasses = size === 'sm' ? 'h-[32px] px-3 text-sm min-w-[44px]' : 'h-[40px] px-4 text-base min-w-[44px]';
  
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
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        <span className={clsx(loading && 'invisible flex')}>{children}</span>
        {loading && <span className="absolute">{children}</span>}
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
EOF

cat << 'EOF' > src/ui/primitives/IconButton.tsx
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
EOF

cat << 'EOF' > src/ui/primitives/Field.tsx
import * as React from 'react';
import { clsx } from 'clsx';

interface FieldContextValue {
  id: string;
  isInvalid: boolean;
  describedBy: string | undefined;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

export function useField() {
  return React.useContext(FieldContext);
}

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  id?: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

export function Field({ id: idProp, label, hint, error, children, className, ...props }: FieldProps) {
  const generatedId = React.useId();
  const id = idProp || generatedId;
  const isInvalid = !!error;
  
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  
  let describedBy: string | undefined;
  if (error) describedBy = errorId;
  else if (hint) describedBy = hintId;

  return (
    <FieldContext.Provider value={{ id, isInvalid, describedBy }}>
      <div className={clsx('space-y-1.5', className)} {...props}>
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {children}
        {error ? (
          <p id={errorId} className="text-sm text-danger" aria-live="polite">{error}</p>
        ) : hint ? (
          <p id={hintId} className="text-sm text-ink-muted">{hint}</p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
EOF

cat << 'EOF' > src/ui/primitives/Input.tsx
import * as React from 'react';
import { clsx } from 'clsx';
import { useField } from './Field';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const field = useField();
    return (
      <input
        ref={ref}
        id={field?.id}
        aria-invalid={field?.isInvalid}
        aria-describedby={field?.describedBy}
        className={clsx(
          'flex h-10 w-full rounded-[var(--radius-sm)] border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50',
          field?.isInvalid ? 'border-danger' : 'border-rule-strong',
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxLength?: number;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, maxLength, ...props }, ref) => {
    const field = useField();
    const [length, setLength] = React.useState(0);
    
    return (
      <div className="relative">
        <textarea
          ref={ref}
          id={field?.id}
          aria-invalid={field?.isInvalid}
          aria-describedby={field?.describedBy}
          maxLength={maxLength}
          onChange={(e) => {
            setLength(e.target.value.length);
            props.onChange?.(e);
          }}
          className={clsx(
            'flex min-h-[80px] w-full rounded-[var(--radius-sm)] border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50',
            field?.isInvalid ? 'border-danger' : 'border-rule-strong',
            className
          )}
          {...props}
        />
        {maxLength && length > maxLength * 0.8 && (
          <div className="absolute bottom-2 right-2 text-xs text-ink-muted bg-surface/80 px-1 rounded">
            {length}/{maxLength}
          </div>
        )}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => {
    const field = useField();
    return (
      <select
        ref={ref}
        id={field?.id}
        aria-invalid={field?.isInvalid}
        aria-describedby={field?.describedBy}
        className={clsx(
          'flex h-10 w-full rounded-[var(--radius-sm)] border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50',
          field?.isInvalid ? 'border-danger' : 'border-rule-strong',
          className
        )}
        {...props}
      />
    );
  }
);
Select.displayName = 'Select';

export const DateInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const field = useField();
    return (
      <input
        type="date"
        ref={ref}
        id={field?.id}
        aria-invalid={field?.isInvalid}
        aria-describedby={field?.describedBy}
        className={clsx(
          'flex h-10 w-full rounded-[var(--radius-sm)] border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50',
          field?.isInvalid ? 'border-danger' : 'border-rule-strong',
          className
        )}
        {...props}
      />
    );
  }
);
DateInput.displayName = 'DateInput';
EOF

cat << 'EOF' > src/ui/primitives/CheckCircle.tsx
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
EOF

cat << 'EOF' > src/ui/primitives/Progress.tsx
import * as React from 'react';
import { clsx } from 'clsx';
import { formatPercent } from '../format';

export interface ProgressBarProps {
  progress: number | null;
  className?: string;
  label?: string;
}

export function ProgressBar({ progress, className, label }: ProgressBarProps) {
  const isNull = progress === null;
  const val = isNull ? 0 : Math.round(progress * 100);
  
  return (
    <div className={clsx('w-full', className)}>
      <div className="flex justify-between items-center text-sm mb-1.5">
        <span className="text-ink-muted font-medium">{label || 'Progress'}</span>
        <span className="text-ink font-medium tabular-nums">{formatPercent(progress)}</span>
      </div>
      <div 
        className="h-2 w-full bg-surface-sunken overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={isNull ? undefined : val}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progress'}
      >
        <span className="sr-only">{isNull ? 'Not measurable yet' : `${val}%`}</span>
        {!isNull && (
          <div 
            className="h-full bg-accent transition-all duration-300 ease-out rounded-full"
            style={{ width: `${val}%` }}
          />
        )}
      </div>
    </div>
  );
}

export function ProgressRing({ progress, size = 40, strokeWidth = 4, className }: ProgressBarProps & { size?: number, strokeWidth?: number }) {
  const isNull = progress === null;
  const val = isNull ? 0 : Math.max(0, Math.min(1, progress));
  
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - val * circumference;

  return (
    <div 
      className={clsx('relative inline-flex items-center justify-center', className)}
      role="progressbar"
      aria-valuenow={isNull ? undefined : Math.round(val * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className="sr-only">{isNull ? 'Not measurable yet' : `${Math.round(val * 100)}%`}</span>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          className="text-surface-sunken"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        {!isNull && (
          <circle
            className="text-accent transition-all duration-300 ease-out"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
        )}
      </svg>
    </div>
  );
}
EOF
