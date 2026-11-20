import * as React from 'react';
import { clsx } from 'clsx';
import { formatMemberNumber } from '@/application/achievements';

/**
 * The Founding Member credential. One quiet brass hairline and the member number; no fills, no glow, no motion.
 * The mark is the centre cell of the Harada sheet: the goal everything else is built around.
 */
function FoundingGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className={clsx('shrink-0', className)}>
      <rect x="0.5" y="0.5" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="4" y="4" width="4" height="4" fill="currentColor" />
    </svg>
  );
}

/** Compact mark beside a name: "Founding No. 0042". */
export function FoundingMark({ number, className }: { number: number; className?: string }) {
  const label = `Founding Member ${formatMemberNumber(number)}`;
  return (
    <span
      title={label}
      aria-label={label}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-founder/50 px-1.5 py-px',
        'font-mono text-xs leading-4 tracking-[0.08em] text-founder uppercase',
        className,
      )}
    >
      <FoundingGlyph className="h-2.5 w-2.5" />
      <span aria-hidden="true">Founding {formatMemberNumber(number)}</span>
    </span>
  );
}

/** The profile credential block. */
export function FoundingCredential({ number, since }: { number: number; since: string }) {
  const sinceLabel = formatMonthYear(since);
  return (
    <section
      aria-label={`Harada Founding Member ${formatMemberNumber(number)}`}
      className="relative border-t border-founder/40 pt-5 pb-1"
    >
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-xs tracking-[0.32em] text-ink-muted uppercase">Harada</p>
          <p className="font-mono text-xs tracking-[0.24em] text-founder uppercase">Founding Member</p>
        </div>
        <FoundingGlyph className="h-5 w-5 text-founder" />
      </div>
      <p className="mt-3 font-serif text-4xl leading-none tracking-tight text-ink tabular-nums">
        {formatMemberNumber(number)}
      </p>
      <p className="mt-3 max-w-[48ch] text-sm text-ink-muted">
        Among the first 100 members helping build Harada.
        {sinceLabel && <span className="whitespace-nowrap"> Since {sinceLabel}.</span>}
      </p>
    </section>
  );
}

function formatMonthYear(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
