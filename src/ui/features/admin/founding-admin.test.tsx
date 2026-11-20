// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FoundingOverviewDTO } from '@/application/admin-identity';
import { FoundingAdmin, type FoundingAdminActions } from './FoundingAdmin';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const overview: FoundingOverviewDTO = {
  capacity: 100,
  remaining: 98,
  nextNumber: 3,
  members: [
    {
      userId: '11111111-1111-4111-8111-111111111111',
      memberNumber: 1,
      approvedAt: '2026-10-01T10:00:00Z',
      username: 'first',
      displayName: 'First Member',
      approvedBy: 'operator',
    },
  ],
  audit: [
    { id: 1, action: 'founding', reason: 'Approved application', occurredAt: '2026-10-01T10:00:00Z', actor: 'operator', target: 'first' },
  ],
};

function makeActions(): FoundingAdminActions {
  return {
    search: vi.fn(async () => ({
      ok: true as const,
      data: [
        { userId: '22222222-2222-4222-8222-222222222222', username: 'next', displayName: 'Next Up', joinedAt: '2026-01-01', foundingMemberNumber: null },
        { userId: '11111111-1111-4111-8111-111111111111', username: 'first', displayName: 'First Member', joinedAt: '2026-01-01', foundingMemberNumber: 1 },
      ],
    })),
    grant: vi.fn(async () => ({ ok: true as const, data: true as const })),
    revoke: vi.fn(async () => ({ ok: false as const, message: 'Not allowed' })),
  };
}

describe('FoundingAdmin', () => {
  it('shows the cohort, the next number and the audit trail', () => {
    render(<FoundingAdmin overview={overview} actions={makeActions()} />);
    expect(screen.getByText(/2 of 100 numbers used/)).toBeTruthy();
    expect(screen.getByText(/next is No\. 0003/)).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'No. 0001' })).toBeTruthy();
    expect(screen.getByText(/Audit log \(1\)/)).toBeTruthy();
  });

  it('approving a searched member needs a reason, then refreshes', async () => {
    const actions = makeActions();
    render(<FoundingAdmin overview={overview} actions={actions} />);
    await userEvent.type(screen.getByLabelText(/Find a member/), 'next');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    // Existing members show their number instead of an approve button.
    expect(await screen.findAllByRole('button', { name: 'Approve as Founding Member' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Approve as Founding Member' }));
    await userEvent.type(screen.getByLabelText('Reason for approval'), 'Early tester');
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(actions.grant).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222', 'Early tester'));
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByText('Approved @next')).toBeTruthy();
  });

  it('surfaces a server refusal on revoke without changing anything', async () => {
    const actions = makeActions();
    render(<FoundingAdmin overview={overview} actions={actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await userEvent.type(screen.getByLabelText('Reason for revoking'), 'Mistake');
    await userEvent.click(screen.getAllByRole('button', { name: 'Revoke' }).at(-1)!);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Not allowed');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('disables approval when all 100 numbers are used', async () => {
    render(<FoundingAdmin overview={{ ...overview, remaining: 0, nextNumber: null }} actions={makeActions()} />);
    expect(screen.getByText(/no numbers left/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/Find a member/), 'next');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    const btn = await screen.findByRole('button', { name: 'Approve as Founding Member' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});
