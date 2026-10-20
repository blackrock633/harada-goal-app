// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoalDetailDTO, GoalFieldsDTO, GoalMetricsDTO, OutcomeDTO } from '@/application/dto';
import { GoalForm } from './GoalForm';
import { GoalOverview } from './GoalOverview';

afterEach(cleanup);

const today = '2026-10-19';
const fields = (o: Partial<GoalFieldsDTO> = {}): GoalFieldsDTO => ({
  id: 'g1', title: 'Run a marathon', vision: 'A strong, healthy me', successCriteria: 'Finish in 4 hours', targetDate: '2027-04-01', status: 'draft',
  purpose: { selfTangible: 'Health', selfIntangible: '', othersTangible: '', othersIntangible: 'Be an example' },
  activatedOn: null, achievedAt: null, archivedAt: null, createdAt: '', updatedAt: '2026-10-01T10:00:00.000Z', ...o,
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
    await userEvent.type(screen.getByLabelText(/how you'll know you've succeeded/i), 'I feel peaceful and content');
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
  archivedAt: null, createdAt: '', updatedAt: '', taskCompletion: 0.5, completedTasks: 0, totalTasks: 0, routineAdherence: null, routineCount: 0, attainment: null, actions: [], slots: Array(8).fill(null), ...extra,
});

const metrics = (m: Partial<GoalMetricsDTO> = {}): GoalMetricsDTO => ({
  planning: { filled: 2, total: 72, ratio: 2 / 72 }, taskCompletion: null, completedTasks: 0, totalTasks: 0,
  routineAdherence: null, routineCount: 0, attainment: null, ...m,
});
const unavailable = { ok: false as const, error: { code: 'UNAVAILABLE' as const, message: 'x' } };

describe('GoalForm contract', () => {
  it('persists successCriteria separately from vision', async () => {
    const { createGoal } = setup();
    await userEvent.type(screen.getByLabelText('What is your goal?'), 'Be calmer');
    await userEvent.type(screen.getByLabelText(/how you'll know you've succeeded/i), 'Sleep 8 hours');
    await userEvent.type(screen.getByLabelText(/^vision/i), 'A calm home');
    await userEvent.click(screen.getByRole('button', { name: /create goal/i }));
    await waitFor(() => expect(createGoal).toHaveBeenCalled());
    const arg = createGoal.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.successCriteria).toBe('Sleep 8 hours');
    expect(arg.vision).toBe('A calm home');
  });

  it('reuses the same client id when retrying after UNAVAILABLE and keeps input', async () => {
    const createGoal = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(unavailable))
      .mockImplementationOnce(() => ok(fields()));
    setup(createGoal);
    await userEvent.type(screen.getByLabelText('What is your goal?'), 'Mine');
    await userEvent.click(screen.getByRole('button', { name: /create goal/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't reach the server/);
    expect((screen.getByLabelText('What is your goal?') as HTMLInputElement).value).toBe('Mine');
    await userEvent.click(screen.getByRole('button', { name: /create goal/i }));
    await waitFor(() => expect(createGoal).toHaveBeenCalledTimes(2));
    const [a, b] = createGoal.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(b).toBe(a);
  });

  it('sends expectedUpdatedAt on edit', async () => {
    const updateGoal = vi.fn((_: unknown) => ok(fields()));
    render(<GoalForm mode="edit" goal={fields()} today={today} mutations={{ createGoal: vi.fn(), updateGoal } as never} />);
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(updateGoal).toHaveBeenCalled());
    expect(updateGoal.mock.calls[0]![0]).toMatchObject({ goalId: 'g1', expectedUpdatedAt: '2026-10-01T10:00:00.000Z', successCriteria: 'Finish in 4 hours' });
  });

  it('on CONFLICT keeps input and offers Reload latest', async () => {
    const updateGoal = vi.fn((_: unknown) =>
      Promise.resolve({ ok: false as const, error: { code: 'CONFLICT' as const, message: '' } }));
    const onReloadLatest = vi.fn();
    render(<GoalForm mode="edit" goal={fields()} today={today} onReloadLatest={onReloadLatest}
      mutations={{ createGoal: vi.fn(), updateGoal } as never} />);
    await userEvent.clear(screen.getByLabelText('What is your goal?'));
    await userEvent.type(screen.getByLabelText('What is your goal?'), 'Edited');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/changed somewhere else/);
    expect((screen.getByLabelText('What is your goal?') as HTMLInputElement).value).toBe('Edited');
    await userEvent.click(screen.getByRole('button', { name: 'Reload latest' }));
    expect(onReloadLatest).toHaveBeenCalled();
  });
});

describe('GoalOverview', () => {
  const detail = (o: Partial<GoalDetailDTO> = {}): GoalDetailDTO => {
    const outcomes = [outcome(0), outcome(3, { measure: { current: 5, target: 10, unit: 'km' } })];
    const grid: (OutcomeDTO | null)[] = Array(8).fill(null);
    for (const x of outcomes) grid[x.position!] = x;
    return {
      ...fields(), metrics: metrics(), pace: 'unknown', outcomes, matrix: { outcomes: grid },
      archivedOutcomes: [], archivedActions: [], ...o,
    };
  };
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

  it('shows no routine data yet when adherence is null, and hides the line with no routines', () => {
    const { unmount } = render(<GoalOverview goal={detail({ outcomes: [], metrics: metrics({ routineCount: 1, routineAdherence: null }) })} today={today} activateGoal={act} />);
    expect(screen.getByText('No routine data yet')).toBeTruthy();
    unmount();
    render(<GoalOverview goal={detail({ outcomes: [], metrics: metrics() })} today={today} activateGoal={act} />);
    expect(screen.queryByText(/adherence/)).toBeNull();
    expect(screen.queryByText('No routine data yet')).toBeNull();
  });

  it('uses metrics, not the outcomes list', () => {
    render(<GoalOverview goal={detail({
      outcomes: [], metrics: metrics({ planning: { filled: 40, total: 72, ratio: 0.55 }, completedTasks: 3, totalTasks: 9, routineCount: 2, routineAdherence: 0.75, attainment: 0.42 }),
    })} today={today} activateGoal={act} />);
    expect(screen.getByText(/40 of 72 positions filled/)).toBeTruthy();
    expect(screen.getByText(/3 of 9 tasks done/)).toBeTruthy();
    expect(screen.getByText(/2 routines/)).toBeTruthy();
    expect(screen.getByText('Routines: 75% adherence over 28 days')).toBeTruthy();
    expect(screen.getByText(/Measured attainment: 42%/)).toBeTruthy();
    expect(screen.getByText(/Averaged from the measures/)).toBeTruthy();
  });

  it('hides the pace badge when pace is unknown and shows it otherwise', () => {
    const { unmount } = render(<GoalOverview goal={detail()} today={today} activateGoal={act} />);
    expect(screen.queryByText(/by measures/)).toBeNull();
    unmount();
    render(<GoalOverview goal={detail({ pace: 'on_track' })} today={today} activateGoal={act} />);
    expect(screen.getByText('On track (by measures)')).toBeTruthy();
  });

  it('shows success criteria and vision as separate sections only when non-empty', () => {
    const { unmount } = render(<GoalOverview goal={detail()} today={today} activateGoal={act} />);
    expect(screen.getByRole('heading', { name: "How you'll know" })).toBeTruthy();
    expect(screen.getByText('Finish in 4 hours')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Vision' })).toBeTruthy();
    unmount();
    render(<GoalOverview goal={detail({ vision: '', successCriteria: '' })} today={today} activateGoal={act} />);
    expect(screen.queryByRole('heading', { name: "How you'll know" })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Vision' })).toBeNull();
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
    render(<GoalOverview goal={detail({ outcomes: [], matrix: { outcomes: Array(8).fill(null) } })} today={today} activateGoal={act} />);
    expect(screen.getByText('No key areas yet')).toBeTruthy();
  });
});
