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
