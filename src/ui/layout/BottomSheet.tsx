'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

export interface BottomSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Required: names the dialog for assistive tech. */
  title: string;
  description?: string;
  trigger?: React.ReactNode;
  /** Sticky footer, typically action buttons. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  footer,
  children,
}: BottomSheetProps) {
  // Keep a focused field visible when the on-screen keyboard resizes the viewport.
  const handleFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const t = e.target;
    if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) {
      setTimeout(() => t.scrollIntoView?.({ block: 'center', behavior: 'auto' }), 250);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          onFocusCapture={handleFocus}
          className={clsx(
            'fixed z-50 flex flex-col overflow-hidden border border-rule bg-surface shadow-[0_8px_30px_rgb(0_0_0_/_0.12)]',
            // phone: bottom sheet
            'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-[var(--radius-md)]',
            'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:slide-in-from-bottom motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:slide-out-to-bottom motion-safe:duration-200',
            // >=768: centered dialog
            'md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:max-h-[85dvh] md:rounded-[var(--radius-md)]'
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-rule px-4 py-3 md:px-6">
            <div className="min-w-0">
              <DialogPrimitive.Title className="break-words font-serif text-lg font-medium leading-snug [overflow-wrap:anywhere]">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-1 text-sm text-ink-muted">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="-mr-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6">
            {children}
          </div>
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-rule bg-surface px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:flex-row md:justify-end md:px-6 md:pb-3">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
