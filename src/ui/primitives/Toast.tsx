"use client";

import * as React from 'react';
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
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...data, id }]);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Bottom of the screen, above the phone tab bar, so toasts never cover the header or page title. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[100] flex flex-col gap-2 p-4 md:left-auto md:max-w-[420px] lg:bottom-0"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Errors stay until dismissed; toasts with an action (e.g. Undo) get long enough to reach it. */
export function toastDuration(toast: Pick<ToastData, 'type' | 'action'>): number | null {
  if (toast.type === 'error') return null;
  return toast.action ? 10_000 : 5_000;
}

function ToastItem({ toast, onRemove: removeById }: { toast: ToastData; onRemove: (id: string) => void }) {
  const [paused, setPaused] = React.useState(false);
  const onRemove = () => removeById(toast.id);
  const duration = toastDuration(toast);

  // Keyed on the toast id (not a per-render callback) so new toasts don't restart existing timers.
  React.useEffect(() => {
    if (duration === null || paused) return;
    const timer = setTimeout(() => removeById(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, duration, paused, removeById]);

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={clsx(
        'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-[var(--radius-md)] border p-4 pr-8 shadow-lg animate-in fade-in slide-in-from-bottom-5',
        toast.type === 'error' ? 'bg-danger text-accent-ink border-danger' : 'bg-surface border-rule text-ink'
      )}
    >
      <div className="grid gap-1">
        {toast.title && <div className="text-sm font-semibold">{toast.title}</div>}
        {toast.description && (
          <div className="text-sm opacity-90">{toast.description}</div>
        )}
      </div>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick();
            onRemove();
          }}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border bg-transparent px-3 text-sm font-medium ring-offset-paper transition-colors hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-accent group-[.bg-danger]:border-accent-ink/30 group-[.bg-danger]:hover:bg-accent-ink/10 cursor-pointer"
        >
          {toast.action.label}
        </button>
      )}
      <button
        aria-label="Close"
        onClick={onRemove}
        className="absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center rounded-sm opacity-70 ring-offset-paper transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer group-[.bg-danger]:text-accent-ink"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
