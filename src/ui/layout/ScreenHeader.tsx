import * as React from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { ChevronLeft } from 'lucide-react';

export interface ScreenHeaderProps {
  title: string;
  eyebrow?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  className?: string;
}

export function ScreenHeader({ title, eyebrow, meta, actions, back, className }: ScreenHeaderProps) {
  return (
    <header className={clsx('mb-6 min-w-0', className)}>
      {back && (
        <Link
          href={back.href}
          className="-ml-2 mb-1 inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="mb-1 text-sm text-ink-muted">{eyebrow}</p>}
          <h1 className="break-words font-serif text-2xl font-medium leading-tight [overflow-wrap:anywhere] md:text-3xl">
            {title}
          </h1>
          {meta && <div className="mt-1 text-sm text-ink-muted">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
