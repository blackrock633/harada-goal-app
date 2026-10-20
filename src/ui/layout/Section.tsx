import * as React from 'react';
import { clsx } from 'clsx';

export interface SectionProps {
  title: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function Section({ title, actions, children, className }: SectionProps) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className={clsx('mt-8 min-w-0', className)}>
      <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
        <h2 id={id} className="min-w-0 break-words font-serif text-xl [overflow-wrap:anywhere]">
          {title}
        </h2>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}
