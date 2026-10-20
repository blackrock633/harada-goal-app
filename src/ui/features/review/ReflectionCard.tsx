'use client';

import * as React from 'react';
import type { ReflectionDTO } from '@/application/dto';

const ROWS: { key: 'wentWell' | 'didntGoWell' | 'nextChange'; label: string }[] = [
  { key: 'wentWell', label: 'What went well?' },
  { key: 'didntGoWell', label: "What didn't?" },
  { key: 'nextChange', label: 'What will you change?' },
];

export function ReflectionCard({ reflection }: { reflection: ReflectionDTO }) {
  const [open, setOpen] = React.useState(false);
  const rows = ROWS.filter((r) => reflection[r.key].trim() !== '');
  const long = rows.some((r) => reflection[r.key].length > 160 || reflection[r.key].split('\n').length > 3);
  return (
    <div className="rounded-[var(--radius-md)] border border-rule bg-surface p-3 text-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {reflection.kind === 'weekly' ? 'Weekly reflection' : 'Daily reflection'}
      </p>
      <dl className="space-y-2">
        {rows.map((r) => (
          <div key={r.key}>
            <dt className="font-medium text-ink">{r.label}</dt>
            <dd className={`whitespace-pre-wrap break-words text-ink-muted ${open ? '' : 'line-clamp-3'}`}>
              {reflection[r.key]}
            </dd>
          </div>
        ))}
      </dl>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="mt-2 min-h-[44px] text-sm font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
