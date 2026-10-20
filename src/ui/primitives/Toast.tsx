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
      <div 
        className="fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px] pointer-events-none gap-2"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onRemove }: { toast: ToastData; onRemove: () => void }) {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onRemove();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onRemove]);

  return (
    <div
      role="status"
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
