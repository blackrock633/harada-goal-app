'use client';

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
