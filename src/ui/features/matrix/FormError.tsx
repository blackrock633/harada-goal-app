'use client';

import * as React from 'react';
import type { AppError } from '@/application/result';
import { errorMessage, isConflict } from '@/ui/errors';
import { Button } from '@/ui/primitives';

/** A mutation failure shown with the shared wording; offers "Reload latest" on CONFLICT. */
export interface FormFailure {
  message: string;
  conflict: boolean;
}

export function toFailure(error: AppError): FormFailure {
  return { message: errorMessage(error), conflict: isConflict(error) };
}

export function FormError({ failure, onReloadLatest }: { failure: FormFailure; onReloadLatest?: () => void }) {
  return (
    <div role="alert" className="rounded-[var(--radius-sm)] border border-danger/30 bg-danger/10 p-2 text-sm text-danger">
      <p className="[overflow-wrap:anywhere]">{failure.message}</p>
      {failure.conflict && onReloadLatest && (
        <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={onReloadLatest}>
          Reload latest
        </Button>
      )}
    </div>
  );
}
