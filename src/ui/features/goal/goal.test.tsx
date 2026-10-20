// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoalDetailDTO, GoalFieldsDTO, OutcomeDTO } from '@/application/dto';
import { GoalForm } from './GoalForm';
import { GoalOverview } from './GoalOverview';

afterEach(cleanup);

const today = '2026-10-19';
const fields = (o: Partial<GoalFieldsDTO> = {}): GoalFieldsDTO => ({
  id: 'g1', title: 'Run a marathon', vision: 'Finish in 4 hours', targetDate: '2027-04-01', status: 'draft',
  purpose: { selfTangible: 'Health', selfIntangible: '', othersTangible: '', othersIntangible: 'Be an example' },
  activatedOn: null, achievedAt: null, archivedAt: null, createdAt: '', updatedAt: '', ...o,
});
const ok = (data: GoalFieldsDTO) => Promise.resolve({ ok: true as const, data });

function setup(createGoal: ReturnType<typeof vi.fn> = vi.fn((_: unknown) => ok(fields()))) {
  const updateGoal = vi.fn((_: unknown) => ok(fields()));
  const onCreated = vi.fn();
  render(<GoalForm mode="create" today={today} mutations={{ createGoal, updateGoal } as never} onCreated={onCreated} />);
  return { createGoal, onCreated };
}

describe('GoalForm create', () => {
  it('blocks an empty title and focuses it', async () => {
    const { createGoal } = setup();
    await userEvent.click(screen.getByRole('button', { name: /create goal/i }));
    expect(await screen.findByText('Required')).toBeTruthy();
    expect(createGoal).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('What is your goal?')));
  });

  it('allows a title up to the limit and shows a counter', async () => {
    const { createGoal, onCreated } = setup();
    await userEvent.click(screen.getByLabelText('What is your goal?'));
    await userEvent.paste('a'.repeat(120));
    expect(screen.getByText('120/120')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /create goal/i }));
    await waitFor(() => expect(createGoal).toHaveBeenCalled());
    expect(onCreated).toHaveBeenCalled();
  });

  it('rejects titles over the limit', async () => {
    const { createGoal } = setup();
    await userEvent.click(screen.getByLabelText('What is your goal?'));
    await userEvent.paste('a'.repeat(121));
    await userEvent.click(screen.getByRole('button', { name: /create goal/i }));
    expect(await screen.findByText(/under 120/)).toBeTruthy();
    expect(createGoal).not.toHaveBeenCalled();
  });

  it('blocks a past target date on create', async () => {
    const { createGoal } = setup();
    await userEvent.type(screen.getByLabelText('What is your goal?'), 'x');
    await userEvent.type(screen.getByLabelText(/target date/i), '2020-01-01');
    await userEvent.click(screen.getByRole('button', { name: /create goal/i }));
    expect(await screen.findByText('Pick a date in the future.')).toBeTruthy();
    expect(createGoal).not.toHaveBeenCalled();
  });

  it('shows server fieldErrors and keeps input', async () => {
    const createGoal = vi.fn((_: unknown) =>
      Promise.resolve({ ok: false as const, error: { code: 'VALIDATION' as const, message: 'bad', fieldErrors: { title: ['Title already used'] } } }),
    );
    setup(createGoal);
    await userEvent.type(screen.getByLabelText('What is your goal?'), 'Mine');
    await userEvent.click(screen.getByRole('button', { name: /create goal/i }));
    expect(await screen.findByText('Title already used')).toBeTruthy();
    expect((screen.getByLabelText('What is your goal?') as HTMLInputElement).value).toBe('Mine');
  });

  it('disables submit while pending', async () => {
    let resolve!: (v: unknown) => void;
    const createGoal = vi.fn((_: unknown) => new Promise((r) => { resolve = r; })) as never;
    setup(createGoal);
    await userEvent.type(screen.getByLabelText('What is your goal?'), 'Mine');
    await userEvent.click(screen.getByRole('button', { name: /create goal/i }));
    const btn = screen.getByRole('button', { name: /create goal/i });
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('aria-busy')).toBe('true');
    resolve({ ok: true, data: fields() });
  });

  it('accepts a qualitative vision with a hint, not an error', async () => {
    const { createGoal } = setup();
    await userEvent.type(screen.getByLabelText('What is your goal?'), 'Be calmer');
    await userEvent.type(screen.getByLabelText('What does success look like?'), 'I feel peaceful and content');
    expect(screen.getByRole('note').textContent).toMatch(/qualitative/);
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /create goal/i }));
    await waitFor(() => expect(createGoal).toHaveBeenCalled());
  });
});

describe('GoalForm edit', () => {
  it('prefills, shows the matrix-preserved note and expands filled reasons', () => {
    render(<GoalForm mode="edit" goal={fields()} today={today} mutations={{ createGoal: vi.fn(), updateGoal: vi.fn() } as never} />);
    expect((screen.getByLabelText('What is your goal?') as HTMLInputElement).value).toBe('Run a marathon');
    expect(screen.getByText('Changing your goal keeps your key areas and actions.')).toBeTruthy();
    expect(screen.getByDisplayValue('Be an example')).toBeTruthy();
    expect(screen.queryByText('Add more reasons')).toBeNull();
  });

  it('warns but does not block a past date', async () => {
    const updateGoal = vi.fn((_: unknown) => ok(fields()));
    const onSaved = vi.fn();
    render(<GoalForm mode="edit" goal={fields({ targetDate: '2020-01-01' })} today={today} mutations={{ createGoal: vi.fn(), updateGoal } as never} onSaved={onSaved} />);
    expect(screen.getByRole('status').textContent).toMatch(/already passed/);
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});

const outcome = (position: number, extra: Partial<OutcomeDTO> = {}): OutcomeDTO => ({
  id: `o${position}`, goalId: 'g1', title: `Area ${position}`, description: '', measure: null, position,
  archivedAt: null, createdAt: '', updatedAt: '', progress: 0.5, actions: [], ...extra,
});

describe('GoalOverview', () => {
  const detail = (o: Partial<GoalDetailDTO> = {}): GoalDetailDTO => ({
    ...fields(), progress: null, pace: 'unknown', outcomes: [outcome(0), outcome(3, { measure: { current: 5, target: 10, unit: 'km' } })],
    archivedOutcomes: [], archivedActions: [], ...o,
  });
  const act = vi.fn();

  it('renders 8 key-area rows including empty slots, never a merged progress figure', () => {
    render(<GoalOverview goal={detail()} today={today} activateGoal={act} />);
    expect(screen.getAllByRole('listitem').filter((li) => /^\d+\./.test(li.textContent ?? ''))).toHaveLength(8);
    expect(screen.getAllByText('Empty slot')).toHaveLength(6);
    expect(screen.getByText(/2 of 72 positions filled/)).toBeTruthy();
    expect(screen.getByText(/0 of 0 tasks done/)).toBeTruthy();
    expect(screen.getByText(/Area 3: 5 \/ 10 km/)).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('says not measured when no measures exist, and offers activation for drafts', () => {
    render(<GoalOverview goal={detail({ outcomes: [outcome(0)] })} today={today} activateGoal={act} />);
    expect(screen.getByText('Not measured yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: /activate goal/i })).toBeTruthy();
  });

  it('shows only non-empty purpose quadrants and a relative date', () => {
    render(<GoalOverview goal={detail()} today={today} activateGoal={act} />);
    expect(screen.getByText('Health')).toBeTruthy();
    expect(screen.queryByText('For me, how it will feel')).toBeNull();
    expect(screen.getByText(/days left/)).toBeTruthy();
  });

  it('shows a matrix CTA when there are no key areas', () => {
    render(<GoalOverview goal={detail({ outcomes: [] })} today={today} activateGoal={act} />);
    expect(screen.getByText('No key areas yet')).toBeTruthy();
  });
});
