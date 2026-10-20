import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { IconButton } from './IconButton';

export const DialogRoot = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title?: string; description?: string }
>(({ className, children, title, description, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-paper/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      ref={ref}
      className={clsx(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-rule bg-surface p-6 shadow-[0_8px_30px_rgb(0_0_0_/_0.12)] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-[var(--radius-md)]',
        className
      )}
      {...props}
    >
      {(title || description) && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          {title && <DialogPrimitive.Title className="text-lg font-semibold font-serif leading-none tracking-tight">{title}</DialogPrimitive.Title>}
          {description && <DialogPrimitive.Description className="text-sm text-ink-muted">{description}</DialogPrimitive.Description>}
        </div>
      )}
      {children}
      <DialogPrimitive.Close asChild>
        <IconButton label="Close dialog" className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-paper transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-ink-muted">
          <X className="h-4 w-4" />
        </IconButton>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

import { Input } from './Input';
import { Button } from './Button';

export interface ConfirmDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  cancelText?: string;
  confirmText?: string;
  onConfirm: () => void;
  requireText?: string;
  destructive?: boolean;
  children?: React.ReactNode;
}

export function ConfirmDialog({ open, onOpenChange, title, description, cancelText = 'Cancel', confirmText = 'Confirm', onConfirm, requireText, destructive = false, children }: ConfirmDialogProps) {
  const [text, setText] = React.useState('');
  const canConfirm = requireText ? text === requireText : true;
  
  return (
    <DialogRoot open={open} onOpenChange={(val) => {
      if (!val) setText('');
      onOpenChange?.(val);
    }}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent title={title} description={description}>
        {requireText && (
          <div className="my-4">
            <p className="text-sm mb-2 text-ink-muted">Please type <strong className="text-ink select-none">{requireText}</strong> to confirm.</p>
            <Input 
              value={text} 
              onChange={e => setText(e.target.value)} 
              placeholder={requireText} 
              autoComplete="off" 
              spellCheck={false} 
            />
          </div>
        )}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4">
          <Button variant="ghost" onClick={() => onOpenChange?.(false)}>{cancelText}</Button>
          <Button variant={destructive ? 'danger' : 'primary'} disabled={!canConfirm} onClick={() => {
            onConfirm();
            onOpenChange?.(false);
          }}>
            {confirmText}
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
