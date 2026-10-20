import * as React from 'react';
import { clsx } from 'clsx';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'draft' | 'active' | 'achieved' | 'archived' | 'ahead' | 'on_track' | 'behind' | 'overdue' | 'unknown' | 'danger' | 'default';
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
