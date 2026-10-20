'use client';

import * as React from 'react';
import { clsx } from 'clsx';
import { useField } from './Field';
import { useAdoptPrehydrationValue } from './useAdoptPrehydrationValue';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const field = useField();
    const refCb = useAdoptPrehydrationValue(ref, props.value, props.onChange);
    return (
      <input
        ref={refCb}
        id={field?.id}
        aria-invalid={field?.isInvalid}
        aria-describedby={field?.describedBy}
        className={clsx(
          'flex h-11 sm:h-10 w-full rounded-[var(--radius-sm)] border bg-surface px-3 py-2 text-base sm:text-sm text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50',
          field?.isInvalid ? 'border-danger' : 'border-rule-input',
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
  ({ className, maxLength, onChange, ...props }, ref) => {
    const field = useField();
    const [uncontrolledLength, setLength] = React.useState(() => String(props.defaultValue ?? '').length);
    const length = props.value !== undefined ? String(props.value).length : uncontrolledLength;
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLength(e.target.value.length);
      onChange?.(e);
    };
    const refCb = useAdoptPrehydrationValue(ref, props.value, handleChange);

    return (
      <div className="relative">
        <textarea
          ref={refCb}
          id={field?.id}
          aria-invalid={field?.isInvalid}
          aria-describedby={field?.describedBy}
          maxLength={maxLength}
          onChange={handleChange}
          className={clsx(
            'flex min-h-[80px] w-full rounded-[var(--radius-sm)] border bg-surface px-3 py-2 text-base sm:text-sm text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50',
            field?.isInvalid ? 'border-danger' : 'border-rule-input',
            className
          )}
          {...props}
        />
        {maxLength && length > maxLength * 0.8 && (
          <div aria-live="polite" className="absolute bottom-2 right-2 text-xs text-ink-muted bg-surface/80 px-1 rounded">
            {length}/{maxLength}
          </div>
        )}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => {
    const field = useField();
    const refCb = useAdoptPrehydrationValue(ref, props.value, props.onChange);
    return (
      <select
        ref={refCb}
        id={field?.id}
        aria-invalid={field?.isInvalid}
        aria-describedby={field?.describedBy}
        className={clsx(
          'flex h-11 sm:h-10 w-full rounded-[var(--radius-sm)] border bg-surface px-3 py-2 text-base sm:text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50',
          field?.isInvalid ? 'border-danger' : 'border-rule-input',
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
    const refCb = useAdoptPrehydrationValue(ref, props.value, props.onChange);
    return (
      <input
        type="date"
        ref={refCb}
        id={field?.id}
        aria-invalid={field?.isInvalid}
        aria-describedby={field?.describedBy}
        className={clsx(
          'flex h-11 sm:h-10 w-full rounded-[var(--radius-sm)] border bg-surface px-3 py-2 text-base sm:text-sm text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50',
          field?.isInvalid ? 'border-danger' : 'border-rule-input',
          className
        )}
        {...props}
      />
    );
  }
);
DateInput.displayName = 'DateInput';
