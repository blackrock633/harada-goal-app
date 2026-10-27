// @vitest-environment jsdom
import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionDTO, GoalEventDTO, OutcomeDTO, ReflectionDTO } from '@/application/dto';
import { ReflectionForm } from './ReflectionForm';
import { ReviewView } from './ReviewView';

afterEach(cleanup);

const refl = (over: Partial<ReflectionDTO> = {}): ReflectionDTO => ({
  id: 'r1', goalId: 'g1', date: '2026-10-18', kind: 'daily', wentWell: 'Good run', didntGoWell: '', nextChange: '', answers: {},
  createdAt: '2026-10-18T20:00:00.000Z', updatedAt: '', ...over,
});
const ev = (over: Partial<GoalEventDTO> = {}): GoalEventDTO => ({
  id: 'e1', goalId: 'g1', type: 'outcome_added', subjectId: null, summary: 'Added key area', data: {},
  occurredAt: '2026-10-19T12:00:00', ...over,
});

const GID = '11111111-1111-4111-8111-111111111111';
const act = (id: string, done: boolean): ActionDTO => ({
  id, goalId: 'g1', outcomeId: 'o1', title: id, notes: '', kind: 'task', position: 0, dueDate: null,
  completedAt: done ? '2026-10-19T00:00:00Z' : null, schedule: null, startDate: null, archivedAt: null,
  createdAt: '', updatedAt: '', progress: done ? 1 : 0, dueToday: false, checkedToday: false, streak: 0, focusedToday: false, recentChecks: [],
});
const outcome = (over: Partial<OutcomeDTO> = {}): OutcomeDTO => ({
  id: 'o1', goalId: 'g1', title: 'Fitness', description: '', measure: null, position: 0, archivedAt: null,
  createdAt: '', updatedAt: '', taskCompletion: 0.5, completedTasks: 1, totalTasks: 2, routineAdherence: null, routineCount: 0, attainment: null,
  actions: [act('t1', true), act('t2', false)], slots: [null, null, null, null, null, null, null, null], ...over,
});

describe('ReflectionForm', () => {
  it('reuses one client id across a retry after UNAVAILABLE, then uses a fresh one', async () => {
    const results = [
      { ok: false as const, error: { code: 'UNAVAILABLE' as const, message: 'raw' } },
      { ok: true as const, data: refl() },
      { ok: true as const, data: refl() },
    ];
    const add = vi.fn(async () => results.shift()!);
    render(<ReflectionForm goalId={GID} today="2026-10-19" addReflection={add} />);
    await userEvent.type(screen.getByLabelText('What went well?'), 'hello');
    await userEvent.click(screen.getByRole('button', { name: 'Save reflection' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Couldn't reach the server"));
    expect(screen.getByLabelText('What went well?')).toHaveValue('hello');
    await userEvent.click(screen.getByRole('button', { name: 'Save reflection' }));
    await waitFor(() => expect(screen.getByText('Reflection saved.')).toBeTruthy());
    await userEvent.type(screen.getByLabelText('What went well?'), 'again');
    await userEvent.click(screen.getByRole('button', { name: 'Save reflection' }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(3));
    const ids = (add.mock.calls as unknown as [{ id: string }][]).map((c) => c[0].id);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it('names the date field by its label (A11Y-01)', () => {
    render(<ReflectionForm goalId="11111111-1111-4111-8111-111111111111" today="2026-10-19" addReflection={vi.fn()} />);
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-19');
  });

  it('requires at least one field', async () => {
    const add = vi.fn();
    render(<ReflectionForm goalId="11111111-1111-4111-8111-111111111111" today="2026-10-19" addReflection={add} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save reflection' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one/);
    expect(add).not.toHaveBeenCalled();
  });

  it('keeps text and shows the server error on failure, saved only on ok', async () => {
    const add = vi.fn(async () => ({ ok: false as const, error: { code: 'NOT_FOUND' as const, message: 'Server down' } }));
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

  it('gates weekly reflections for Free users with an upgrade prompt, and allows saving when advanced is true', async () => {
    const saved = refl();
    const add = vi.fn(async () => ({ ok: true as const, data: saved }));
    const onSaved = vi.fn();
    const { rerender } = render(<ReflectionForm goalId="11111111-1111-4111-8111-111111111111" today="2026-10-19" addReflection={add} onSaved={onSaved} />);
    await userEvent.click(screen.getByRole('button', { name: 'weekly' }));
    expect(screen.getByTestId('upgrade-prompt-advanced_reviews')).toHaveTextContent('Reflect. Learn. Improve.');
    expect(screen.queryByRole('button', { name: 'Save reflection' })).toBeNull();
    expect(screen.getByRole('link', { name: 'See Harada Pro' }).getAttribute('href')).toBe('/pricing');
    expect(add).not.toHaveBeenCalled();

    rerender(<ReflectionForm goalId="11111111-1111-4111-8111-111111111111" today="2026-10-19" addReflection={add} onSaved={onSaved} advanced />);
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

  it('shows task counts and measure separately, with no percentage', () => {
    render(
      <ReviewView
        reflectionForm={null}
        completedThisWeek={1}
        outcomes={[outcome({ measure: { current: 5, target: 10, unit: 'km' } })]}
        reflections={[]}
        events={[]}
      />,
    );
    expect(screen.getByText('1 of 2 tasks done')).toBeTruthy();
    expect(screen.getByText('Measure: 5 of 10 km')).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('shows empty states', () => {
    render(<ReviewView reflectionForm={null} completedThisWeek={0} outcomes={[]} reflections={[]} events={[]} />);
    expect(screen.getByText('No key areas yet')).toBeTruthy();
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });
});
