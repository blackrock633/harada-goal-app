#!/bin/bash
set -e

cat << 'EOF' > src/ui/primitives/Dialog.tsx
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
EOF

cat << 'EOF' > src/ui/primitives/Menu.tsx
import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { clsx } from 'clsx';

export const MenuRoot = DropdownMenuPrimitive.Root;
export const MenuTrigger = DropdownMenuPrimitive.Trigger;

export const MenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={clsx(
        'z-50 min-w-[8rem] overflow-hidden rounded-[var(--radius-md)] border border-rule bg-surface p-1 shadow-[0_8px_30px_rgb(0_0_0_/_0.12)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
MenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

export const MenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={clsx(
      'relative flex cursor-pointer select-none items-center rounded-[var(--radius-sm)] px-2 py-1.5 text-sm outline-none transition-colors focus:bg-surface-sunken focus:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      destructive && 'text-danger focus:text-danger',
      className
    )}
    {...props}
  />
));
MenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

export const MenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={clsx('-mx-1 my-1 h-px bg-rule', className)}
    {...props}
  />
));
MenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;
EOF

cat << 'EOF' > src/ui/primitives/Tabs.tsx
import * as React from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { usePathname } from 'next/navigation';

export interface TabItem {
  name: string;
  href: string;
  exact?: boolean;
}

export function Tabs({ tabs, className }: { tabs: TabItem[], className?: string }) {
  const pathname = usePathname();
  
  return (
    <nav className={clsx('flex space-x-4 border-b border-rule', className)} aria-label="Tabs">
      {tabs.map((tab) => {
        const isActive = tab.exact ? pathname === tab.href : pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={clsx(
              'px-1 py-3 text-sm font-medium border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-t-sm',
              isActive
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-muted hover:text-ink hover:border-rule-strong'
            )}
          >
            {tab.name}
          </Link>
        );
      })}
    </nav>
  );
}
EOF

cat << 'EOF' > src/ui/primitives/Badge.tsx
import * as React from 'react';
import { clsx } from 'clsx';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'draft' | 'active' | 'achieved' | 'archived' | 'ahead' | 'on_track' | 'behind' | 'overdue' | 'unknown' | 'default';
}

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  let colorClass = 'bg-surface-sunken text-ink-muted border border-rule';
  switch (variant) {
    case 'active':
    case 'ahead':
      colorClass = 'bg-success/10 text-success border border-success/20'; break;
    case 'achieved':
    case 'on_track':
      colorClass = 'bg-surface-sunken text-ink border border-rule-strong'; break;
    case 'behind':
      colorClass = 'bg-warning/10 text-warning border border-warning/20'; break;
    case 'overdue':
    case 'danger':
      colorClass = 'bg-danger/10 text-danger border border-danger/20'; break;
    case 'draft':
    case 'archived':
    case 'unknown':
    case 'default':
      break;
  }
  
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums',
        colorClass,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
EOF

cat << 'EOF' > src/ui/primitives/Toast.tsx
"use client";

import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

type ToastType = 'success' | 'error' | 'info';

interface ToastData {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextValue {
  toast: (data: Omit<ToastData, 'id'>) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside provider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastData[]>([]);

  const toast = React.useCallback((data: Omit<ToastData, 'id'>) => {
    setToasts((prev) => [...prev, { ...data, id: Math.random().toString(36).substring(2, 9) }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
        {children}
        {toasts.map(({ id, title, description, type, action }) => (
          <ToastPrimitive.Root
            key={id}
            className={clsx(
              'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-[var(--radius-md)] border p-4 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full',
              type === 'error' ? 'bg-danger text-accent-ink border-danger' : 'bg-surface border-rule text-ink'
            )}
            onOpenChange={(open) => {
              if (!open) setToasts((prev) => prev.filter((t) => t.id !== id));
            }}
          >
            <div className="grid gap-1">
              {title && <ToastPrimitive.Title className="text-sm font-semibold">{title}</ToastPrimitive.Title>}
              {description && (
                <ToastPrimitive.Description className="text-sm opacity-90">
                  {description}
                </ToastPrimitive.Description>
              )}
            </div>
            {action && (
              <ToastPrimitive.Action asChild altText={action.label}>
                <button
                  onClick={action.onClick}
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border bg-transparent px-3 text-sm font-medium ring-offset-paper transition-colors hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-accent group-[.bg-danger]:border-accent-ink/30 group-[.bg-danger]:hover:bg-accent-ink/10 cursor-pointer"
                >
                  {action.label}
                </button>
              </ToastPrimitive.Action>
            )}
            <ToastPrimitive.Close className="absolute right-2 top-2 rounded-sm p-1 opacity-70 ring-offset-paper transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer group-[.bg-danger]:text-accent-ink">
              <X className="h-4 w-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
EOF

cat << 'EOF' > src/ui/primitives/Misc.tsx
import * as React from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';
import { Button } from './Button';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('animate-pulse rounded-[var(--radius-sm)] bg-surface-sunken', className)} {...props} />
  );
}

export function EmptyState({ title, description, action }: { title: string, description: string, action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-rule rounded-[var(--radius-md)] bg-paper">
      <h3 className="text-lg font-serif font-semibold text-ink mb-1">{title}</h3>
      <p className="text-sm text-ink-muted mb-4 max-w-sm text-balance">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', description, onRetry }: { title?: string, description?: string, onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-rule rounded-[var(--radius-md)] bg-danger/5">
      <h3 className="text-lg font-serif font-semibold text-danger mb-1">{title}</h3>
      {description && <p className="text-sm text-ink-muted mb-4 max-w-sm text-balance">{description}</p>}
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export const VisuallyHidden = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={clsx(
          'absolute w-[1px] h-[1px] p-0 -m-[1px] overflow-hidden whitespace-nowrap border-0',
          className
        )}
        style={{ clip: 'rect(0, 0, 0, 0)' }}
        {...props}
      />
    );
  }
);
VisuallyHidden.displayName = 'VisuallyHidden';

export function Spinner({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return <Loader2 className={clsx('animate-spin text-ink-muted', className)} {...props} />;
}
EOF
