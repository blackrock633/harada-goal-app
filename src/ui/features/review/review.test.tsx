// @vitest-environment jsdom
import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoalEventDTO, ReflectionDTO } from '@/application/dto';
import { ReflectionForm } from './ReflectionForm';
import { ReviewView } from './ReviewView';

afterEach(cleanup);

const refl = (over: Partial<ReflectionDTO> = {}): ReflectionDTO => ({
  id: 'r1', goalId: 'g1', date: '2026-10-18', kind: 'daily', wentWell: 'Good run', didntGoWell: '', nextChange: '',
  createdAt: '2026-10-18T20:00:00.000Z', updatedAt: '', ...over,
});
const ev = (over: Partial<GoalEventDTO> = {}): GoalEventDTO => ({
  id: 'e1', goalId: 'g1', type: 'outcome_added', subjectId: null, summary: 'Added key area', data: {},
  occurredAt: '2026-10-19T12:00:00', ...over,
});

describe('ReflectionForm', () => {
  it('requires at least one field', async () => {
    const add = vi.fn();
    render(<ReflectionForm goalId="11111111-1111-4111-8111-111111111111" today="2026-10-19" addReflection={add} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save reflection' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one/);
    expect(add).not.toHaveBeenCalled();
  });

  it('keeps text and shows the server error on failure, saved only on ok', async () => {
    const add = vi.fn(async () => ({ ok: false as const, error: { code: 'INTERNAL' as const, message: 'Server down' } }));
    const onSaved = vi.fn();
    render(<ReflectionForm goalId="11111111-1111-4111-8111-111111111111" today="2026-10-19" addReflection={add} onSaved={onSaved} />);
    await userEvent.type(screen.getByLabelText('What went well?'), 'hello');
    await userEvent.click(screen.getByRole('button', { name: 'Save reflection' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Server down'));
    expect(screen.getByLabelText('What went well?')).toHaveValue('hello');
    expect(screen.queryByText('Reflection saved.')).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ goalId: '11111111-1111-4111-8111-111111111111', date: '2026-10-19', kind: 'daily', wentWell: 'hello' }));
  });

  it('clears and confirms on success', async () => {
    const saved = refl();
    const add = vi.fn(async () => ({ ok: true as const, data: saved }));
    const onSaved = vi.fn();
    render(<ReflectionForm goalId="11111111-1111-4111-8111-111111111111" today="2026-10-19" addReflection={add} onSaved={onSaved} />);
    await userEvent.click(screen.getByRole('button', { name: 'weekly' }));
    await userEvent.type(screen.getByLabelText('What will you change?'), 'sleep');
    await userEvent.click(screen.getByRole('button', { name: 'Save reflection' }));
    await waitFor(() => expect(screen.getByText('Reflection saved.')).toBeTruthy());
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(screen.getByLabelText('What will you change?')).toHaveValue('');
  });
});

describe('ReviewView', () => {
  it('orders the timeline newest first, grouped by date', () => {
    render(
      <ReviewView
        reflectionForm={<div>form</div>}
        completedThisWeek={2}
        outcomes={[]}
        reflections={[refl({ id: 'r2', date: '2026-10-17', wentWell: 'Older' }), refl()]}
        events={[ev()]}
      />,
    );
    const groups = screen.getAllByTestId('timeline-group');
    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveTextContent('Added key area');
    expect(groups[1]).toHaveTextContent('Good run');
    expect(groups[2]).toHaveTextContent('Older');
    expect(screen.getByText('2 tasks completed this week.')).toBeTruthy();
  });

  it('shows empty states', () => {
    render(<ReviewView reflectionForm={null} completedThisWeek={0} outcomes={[]} reflections={[]} events={[]} />);
    expect(screen.getByText('No key areas yet')).toBeTruthy();
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });
});
