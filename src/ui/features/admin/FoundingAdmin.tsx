'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { formatMemberNumber } from '@/application/achievements';
import type { FoundingOverviewDTO, MemberSearchResultDTO } from '@/application/admin-identity';
import type { AdminActionResult } from '@/app/actions/admin';
import { Button, Field, Input } from '@/ui/primitives';

export interface FoundingAdminActions {
  search: (query: string) => Promise<AdminActionResult<MemberSearchResultDTO[]>>;
  grant: (userId: string, reason: string) => Promise<AdminActionResult<true>>;
  revoke: (userId: string, reason: string) => Promise<AdminActionResult<true>>;
}

type Pending = { kind: 'grant' | 'revoke'; userId: string; label: string } | null;

/**
 * Approve and revoke Founding Members. Numbers are assigned by the database (never typed here); every change
 * needs a reason and lands in the audit list below.
 */
export function FoundingAdmin({ overview, actions }: { overview: FoundingOverviewDTO; actions: FoundingAdminActions }) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<MemberSearchResultDTO[] | null>(null);
  const [pending, setPending] = React.useState<Pending>(null);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const allocated = overview.capacity - overview.remaining;

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await actions.search(query);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setResults(res.data);
  }

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setError(null);
    setBusy(true);
    const res = pending.kind === 'grant' ? await actions.grant(pending.userId, reason) : await actions.revoke(pending.userId, reason);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setStatus(pending.kind === 'grant' ? `Approved ${pending.label}` : `Revoked ${pending.label}`);
    setPending(null);
    setReason('');
    setResults(null);
    router.refresh();
  }

  const reasonForm = (target: string) =>
    pending?.userId === target && (
      <form onSubmit={(e) => void onConfirm(e)} className="mt-2 flex flex-wrap items-end gap-2">
        <Field label={pending.kind === 'grant' ? 'Reason for approval' : 'Reason for revoking'} className="min-w-[240px] flex-1">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required autoFocus />
        </Field>
        <Button type="submit" size="sm" variant={pending.kind === 'revoke' ? 'danger' : 'primary'} loading={busy}>
          {pending.kind === 'grant' ? 'Approve' : 'Revoke'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setPending(null)}>
          Cancel
        </Button>
      </form>
    );

  return (
    <section aria-labelledby="founding-heading" className="mt-10 min-w-0">
      <h2 id="founding-heading" className="font-serif text-xl text-ink">Founding 100</h2>
      <p className="mt-1 text-sm text-ink-muted">
        {allocated} of {overview.capacity} numbers used ·{' '}
        {overview.nextNumber === null ? 'no numbers left' : `next is ${formatMemberNumber(overview.nextNumber)}`}. A
        revoked number is reissued only if it was the highest.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="mt-3 text-sm text-ink-muted">
          {status}
        </p>
      )}

      <form onSubmit={(e) => void onSearch(e)} className="mt-4 flex flex-wrap items-end gap-2">
        <Field label="Find a member" hint="Username, display name or user id" className="min-w-[240px] flex-1">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={80} />
        </Field>
        <Button type="submit" size="sm" variant="secondary" loading={busy && !pending}>
          Search
        </Button>
      </form>

      {results && (
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {results.length === 0 && <li className="py-2 text-sm text-ink-muted">No members found.</li>}
          {results.map((m) => (
            <li key={m.userId} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{m.displayName}</p>
                  <p className="truncate font-mono text-xs text-ink-muted">@{m.username}</p>
                </div>
                {m.foundingMemberNumber !== null ? (
                  <span className="font-mono text-xs text-founder">{formatMemberNumber(m.foundingMemberNumber)}</span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={overview.nextNumber === null}
                    onClick={() => {
                      setReason('');
                      setPending({ kind: 'grant', userId: m.userId, label: `@${m.username}` });
                    }}
                  >
                    Approve as Founding Member
                  </Button>
                )}
              </div>
              {reasonForm(m.userId)}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <caption className="sr-only">Founding Members</caption>
          <thead>
            <tr className="border-b border-rule text-left text-ink-muted">
              <th scope="col" className="py-2 pr-4 font-normal">No.</th>
              <th scope="col" className="py-2 pr-4 font-normal">Member</th>
              <th scope="col" className="py-2 pr-4 font-normal">Approved</th>
              <th scope="col" className="py-2 font-normal">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {overview.members.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-ink-muted">
                  No Founding Members yet.
                </td>
              </tr>
            )}
            {overview.members.map((m) => (
              <React.Fragment key={m.userId}>
                <tr className="border-b border-rule align-top">
                  <td className="py-2 pr-4 font-mono text-founder tabular-nums">{formatMemberNumber(m.memberNumber)}</td>
                  <td className="py-2 pr-4">
                    <span className="text-ink">{m.displayName}</span>{' '}
                    <span className="font-mono text-xs text-ink-muted">@{m.username}</span>
                  </td>
                  <td className="py-2 pr-4 text-ink-muted">
                    {m.approvedAt.slice(0, 10)}
                    {m.approvedBy && ` by @${m.approvedBy}`}
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setReason('');
                        setPending({ kind: 'revoke', userId: m.userId, label: `@${m.username}` });
                      }}
                    >
                      Revoke
                    </Button>
                  </td>
                </tr>
                {pending?.userId === m.userId && (
                  <tr className="border-b border-rule">
                    <td colSpan={4} className="pb-3">
                      {reasonForm(m.userId)}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {overview.audit.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-ink-muted hover:text-ink">Audit log ({overview.audit.length})</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {overview.audit.map((a) => (
              <li key={a.id} className="text-ink-muted [overflow-wrap:anywhere]">
                <span className="tabular-nums">{a.occurredAt.slice(0, 16).replace('T', ' ')}</span> ·{' '}
                <span className="text-ink">{a.action === 'founding' ? 'Approved' : 'Revoked'}</span> @{a.target ?? 'deleted'} by @
                {a.actor ?? 'deleted'}: {a.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
