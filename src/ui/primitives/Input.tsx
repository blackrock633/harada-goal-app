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
