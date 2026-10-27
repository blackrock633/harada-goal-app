import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { ChallengeSummary, Enrollment } from '@/data/premium';
import type { ExecutionMutations, ReviewMutations } from '@/data/mutations';
import { data as todayData, goal, item } from '@/features/today/fixtures';
import { TodayView } from '@/features/today';
import { ChallengeDashboard } from './ChallengeDashboard';
import { ChallengeEntry, challengeEntryLabel } from './ChallengeEntry';
import { ChallengeLanding, COMMITMENT } from './ChallengeLanding';
import { ChallengeReport } from './ChallengeReport';
import { calendarCells, missedDays } from './format';

const mockJoin = jest.fn();
const mockLeave = jest.fn();
const mockComplete = jest.fn();
const mockTrack = jest.fn();
jest.mock('@/data/premium', () => ({
  ...jest.requireActual('@/data/premium'),
  joinChallenge: (...a: unknown[]) => mockJoin(...a),
  leaveChallenge: (...a: unknown[]) => mockLeave(...a),
  completeChallenge: (...a: unknown[]) => mockComplete(...a),
  track: (...a: unknown[]) => mockTrack(...a),
}));

beforeEach(() => {
  mockJoin.mockReset();
  mockLeave.mockReset();
  mockComplete.mockReset();
  mockTrack.mockReset();
});

function enrollment(over: Partial<Enrollment> = {}): Enrollment {
  return {
    id: 'e1', goalId: 'g1', startDate: '2026-10-08', endDate: '2026-11-06', status: 'active', committedAt: '2026-10-08T08:00:00Z',
    completedAt: null, finalReflection: '', accomplishments: [], createdAt: '2026-10-08T08:00:00Z', ...over,
  };
}

/** Day 12 (2026-10-19): activity on days 1-9 and 12; nothing on days 10 and 11. */
function summary(over: Partial<ChallengeSummary> = {}): ChallengeSummary {
  const days = Array.from({ length: 12 }, (_, i) => {
    const date = `2026-10-${String(8 + i).padStart(2, '0')}`;
    const none = i === 9 || i === 10;
    return { date, tasksCompleted: none ? 0 : 1, routineChecks: none ? 0 : 2, reflections: 0 };
  });
  return {
    enrollment: enrollment(),
    goal: { id: 'g1', title: 'Run a marathon', successCriteria: 'Finish under 4 hours', status: 'active' },
    today: '2026-10-19',
    day: 12,
    daysRemaining: 18,
    days,
    activeDays: 10,
    tasksCompleted: 7,
    routineChecks: 21,
    tasksPlanned: 15,
    weeklyReviews: [1, 2, 3, 4, 5].map((week) => ({ week, done: week === 1 })),
    milestones: [
      { title: 'Buy shoes', date: '2026-10-09' },
      { title: 'First 10k', date: '2026-10-15' },
    ],
    ...over,
  };
}

const landingProps = {
  today: '2026-10-26',
  history: [],
  onJoined: jest.fn(),
  onCreateGoal: jest.fn(),
  onOpenGoal: jest.fn(),
  onOpenReport: jest.fn(),
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('ChallengeLanding', () => {
  it('explains the challenge, then requires a goal and the commitment before joining', async () => {
    mockJoin.mockResolvedValue({ ok: true, data: { id: 'e9' } });
    const onJoined = jest.fn();
    const goals = [goal({ id: 'g1', title: 'Run a marathon' }), goal({ id: 'g2', title: 'Learn Spanish' })];
    await render(<ChallengeLanding {...landingProps} goals={goals} onJoined={onJoined} />);

    expect(screen.getByText(/days 7, 14, 21 and 28/)).toBeOnTheScreen();
    // Start and end dates: today and today + 29.
    expect(screen.getByText('Starts today, Mon, Oct 26')).toBeOnTheScreen();
    expect(screen.getByText('Ends Tue, Nov 24 (day 30)')).toBeOnTheScreen();

    const start = screen.getByRole('button', { name: 'Start the challenge' });
    expect(start).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: 'Learn Spanish' }));
    expect(screen.getByRole('radio', { name: 'Learn Spanish' })).toBeChecked();
    expect(start).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: COMMITMENT }));
    expect(start).toBeEnabled();
    await fireEvent.press(start);
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith({ id: 'e9' }));
    expect(mockJoin).toHaveBeenCalledTimes(1);
    expect(mockJoin).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/), 'g2');
  });

  it('a double tap sends one request, and a retry reuses the same client id', async () => {
    const first = deferred<unknown>();
    mockJoin.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ ok: true, data: { id: 'e9' } });
    await render(<ChallengeLanding {...landingProps} goals={[goal()]} />);
    // A single active goal is preselected.
    expect(screen.getByRole('radio', { name: 'Run a marathon' })).toBeChecked();
    await fireEvent.press(screen.getByRole('checkbox', { name: COMMITMENT }));
    const start = screen.getByRole('button', { name: 'Start the challenge' });
    await fireEvent.press(start);
    await fireEvent.press(start);
    expect(mockJoin).toHaveBeenCalledTimes(1);

    first.resolve({ ok: false, error: { code: 'UNAVAILABLE', message: '' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't reach the server/);
    await fireEvent.press(screen.getByRole('button', { name: 'Start the challenge' }));
    await waitFor(() => expect(mockJoin).toHaveBeenCalledTimes(2));
    expect(mockJoin.mock.calls[1][0]).toBe(mockJoin.mock.calls[0][0]);
    expect(mockJoin.mock.calls[1][1]).toBe('g1');
  });

  it('shows the server message when a challenge is already running', async () => {
    mockJoin.mockResolvedValue({ ok: false, error: { code: 'CONFLICT', message: 'You already have a challenge running.' } });
    await render(<ChallengeLanding {...landingProps} goals={[goal()]} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: COMMITMENT }));
    await fireEvent.press(screen.getByRole('button', { name: 'Start the challenge' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You already have a challenge running.');
  });

  it('no goal: offers to create one', async () => {
    const onCreateGoal = jest.fn();
    await render(<ChallengeLanding {...landingProps} goals={[]} onCreateGoal={onCreateGoal} />);
    expect(screen.queryByRole('button', { name: 'Start the challenge' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Create a goal' }));
    expect(onCreateGoal).toHaveBeenCalled();
  });

  it('draft goal only: says it must be started first and links to it', async () => {
    const onOpenGoal = jest.fn();
    await render(<ChallengeLanding {...landingProps} goals={[goal({ id: 'd1', title: 'Write a novel', status: 'draft' })]} onOpenGoal={onOpenGoal} />);
    expect(screen.getByText(/"Write a novel" is still a draft\. Start the goal first/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Start the challenge' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Open goal' }));
    expect(onOpenGoal).toHaveBeenCalledWith('d1');
  });

  it('lists past challenges and opens their report', async () => {
    const onOpenReport = jest.fn();
    const past = enrollment({ id: 'old', status: 'completed', startDate: '2026-08-01', endDate: '2026-08-30' });
    await render(<ChallengeLanding {...landingProps} goals={[goal()]} history={[past]} onOpenReport={onOpenReport} />);
    await fireEvent.press(screen.getByRole('button', { name: /Run a marathon, Aug 1 to Aug 30, finished/ }));
    expect(onOpenReport).toHaveBeenCalledWith('old');
  });
});

function muts(): ExecutionMutations & Pick<ReviewMutations, 'addReflection'> {
  const ok = async () => ({ ok: true as const, data: {} as never });
  return { completeAction: jest.fn(ok), reopenAction: jest.fn(ok), checkRoutine: jest.fn(ok), uncheckRoutine: jest.fn(ok), addReflection: jest.fn(ok) };
}

const dashProps = {
  onChanged: jest.fn(),
  onLeft: jest.fn(),
  onOpenToday: jest.fn(),
  onOpenReview: jest.fn(),
  onComplete: jest.fn(),
  onShare: jest.fn(),
};

describe('ChallengeDashboard', () => {
  it('shows the stored numbers and neutral missed-day copy', async () => {
    await render(<ChallengeDashboard {...dashProps} summary={summary()} todayData={todayData()} mutations={muts()} />);
    expect(screen.getByText('Day 12 of 30')).toBeOnTheScreen();
    expect(screen.getByText(/18 days remaining/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Tasks completed: 7 of 15 planned')).toBeOnTheScreen();
    expect(screen.getByLabelText('Routine check-ins: 21')).toBeOnTheScreen();
    expect(screen.getByLabelText('Days with activity: 10 of 12')).toBeOnTheScreen();
    expect(screen.getByLabelText('Weekly reviews written: 1 of 5')).toBeOnTheScreen();
    expect(screen.getByText('No activity logged on 2 days. Pick up where you are — nothing resets.')).toBeOnTheScreen();
    expect(screen.queryByText(/streak|missed|failed|broke/i)).toBeNull();
    // Calendar: one summary for screen readers, cells from the stored days.
    expect(screen.getByLabelText('Calendar: activity logged on 10 of 12 days so far. Today is day 12 of 30.')).toBeOnTheScreen();
    expect(screen.getByTestId('challenge-day-10-empty')).toBeTruthy();
    expect(screen.getByTestId('challenge-day-12-active')).toBeTruthy();
    expect(screen.getByTestId('challenge-day-13-future')).toBeTruthy();
    expect(screen.getByText('Day 14 · Weekly review · in 2 days')).toBeOnTheScreen();
    // Before day 30 there is no prompt to finish.
    expect(screen.queryByRole('button', { name: 'Finish the challenge' })).toBeNull();
  });

  it("completes today's actions with the Today mutations and records the first activity of the day", async () => {
    const m = muts();
    const s = summary({ days: summary().days.map((d) => (d.date === '2026-10-19' ? { ...d, tasksCompleted: 0, routineChecks: 0 } : d)) });
    const onChanged = jest.fn();
    const other = { ...item({ id: 'x1', title: 'Other goal task' }), goalId: 'g2' };
    await render(
      <ChallengeDashboard {...dashProps} onChanged={onChanged} summary={s} todayData={todayData({ next: [item(), other] })} mutations={m} />,
    );
    expect(screen.queryByText('Other goal task')).toBeNull();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Complete: Write chapter' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(m.completeAction).toHaveBeenCalledWith({ actionId: 'a1' });
    expect(mockTrack).toHaveBeenCalledWith('challenge_day_completed', { day: 12 });
    expect(screen.getByRole('checkbox', { name: 'Reopen: Write chapter' })).toBeChecked();
  });

  it('notes an obstacle as a daily reflection', async () => {
    const m = muts();
    await render(<ChallengeDashboard {...dashProps} summary={summary()} todayData={todayData()} mutations={m} />);
    await fireEvent.changeText(screen.getByLabelText('What got in the way?'), '  Rain all day  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() =>
      expect(m.addReflection).toHaveBeenCalledWith(expect.objectContaining({ goalId: 'g1', date: '2026-10-19', kind: 'daily', didntGoWell: 'Rain all day' })),
    );
    expect(await screen.findByText("Saved to today's reflection.")).toBeOnTheScreen();
  });

  it('links to the Review tab for the weekly review', async () => {
    const onOpenReview = jest.fn();
    await render(<ChallengeDashboard {...dashProps} onOpenReview={onOpenReview} summary={summary()} todayData={todayData()} mutations={muts()} />);
    await fireEvent.press(screen.getByRole('button', { name: "Write this week's review" }));
    expect(onOpenReview).toHaveBeenCalledWith('g1');
  });

  it('leaves only after confirmation', async () => {
    mockLeave.mockResolvedValue({ ok: true, data: {} });
    const onLeft = jest.fn();
    await render(<ChallengeDashboard {...dashProps} onLeft={onLeft} summary={summary()} todayData={todayData()} mutations={muts()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Leave challenge' }));
    expect(mockLeave).not.toHaveBeenCalled();
    expect(screen.getByText('Leave the challenge?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm leave challenge' }));
    await waitFor(() => expect(onLeft).toHaveBeenCalled());
    expect(mockLeave).toHaveBeenCalledWith('e1');
  });

  it('prompts to finish on day 30', async () => {
    const onComplete = jest.fn();
    await render(
      <ChallengeDashboard {...dashProps} onComplete={onComplete} summary={summary({ day: 30, daysRemaining: 0, today: '2026-11-06' })} todayData={todayData()} mutations={muts()} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Finish the challenge' }));
    expect(onComplete).toHaveBeenCalledWith('e1');
  });
});

const reportProps = { onSaved: jest.fn(), onShare: jest.fn(), onStartAnother: jest.fn(), onKeepGoing: jest.fn() };

describe('ChallengeReport', () => {
  it('before day 30: says when it can be finished and offers no save', async () => {
    await render(<ChallengeReport {...reportProps} summary={summary()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('You can finish the challenge from day 30. Today is day 12 — 18 days to go.');
    expect(screen.queryByRole('button', { name: 'Save privately' })).toBeNull();
    // The verified record is still shown.
    expect(screen.getByText('Finish under 4 hours')).toBeOnTheScreen();
    expect(screen.getByLabelText('Tasks planned: 15')).toBeOnTheScreen();
  });

  it('day 30: up to 5 accomplishments, then saves privately', async () => {
    mockComplete.mockResolvedValue({ ok: true, data: {} });
    const onSaved = jest.fn();
    const milestones = ['A', 'B', 'C', 'D', 'E', 'F'].map((t, i) => ({ title: `Task ${t}`, date: `2026-10-${10 + i}` }));
    await render(<ChallengeReport {...reportProps} onSaved={onSaved} summary={summary({ day: 30, daysRemaining: 0, milestones })} />);
    expect(screen.getByText(/Finishing the challenge isn't the same as reaching the goal/)).toBeOnTheScreen();
    for (const t of ['A', 'B', 'C', 'D']) await fireEvent.press(screen.getByRole('checkbox', { name: `Task ${t}` }));
    // The fifth is typed.
    await fireEvent.changeText(screen.getByLabelText('Add an accomplishment'), 'Ran 30 km in a week');
    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByLabelText('5 of 5 chosen')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Task E' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Task E' }));
    await fireEvent.changeText(screen.getByLabelText('Looking back on the 30 days'), ' Mornings worked. ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save privately' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mockComplete).toHaveBeenCalledWith('e1', 'Mornings worked.', ['Task A', 'Task B', 'Task C', 'Task D', 'Ran 30 km in a week']);
    expect(mockTrack).toHaveBeenCalledWith('challenge_completed', { active_days: 10, accomplishments: 5 });
  });

  it('shows the server refusal when finishing is not allowed yet', async () => {
    mockComplete.mockResolvedValue({ ok: false, error: { code: 'INVALID_STATE', message: 'The challenge can be completed from day 30.' } });
    await render(<ChallengeReport {...reportProps} summary={summary({ day: 30 })} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save privately' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The challenge can be completed from day 30.');
  });

  it('a finished report shows the stored words and links to a card', async () => {
    const onShare = jest.fn();
    const done = enrollment({ status: 'completed', completedAt: '2026-11-06T10:00:00Z', accomplishments: ['Ran 30 km'], finalReflection: 'Steady.' });
    await render(<ChallengeReport {...reportProps} onShare={onShare} summary={summary({ day: 30, enrollment: done })} />);
    expect(screen.getByText('Ran 30 km')).toBeOnTheScreen();
    expect(screen.getByText('Steady.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Create a shareable card' }));
    expect(onShare).toHaveBeenCalledWith('g1');
  });
});

describe('Today entry point', () => {
  it('labels the running challenge, or invites to one', () => {
    expect(challengeEntryLabel([enrollment()], '2026-10-19')).toEqual({ label: '30-Day Challenge · Day 12 of 30', active: true });
    expect(challengeEntryLabel([enrollment({ status: 'completed' })], '2026-10-19')).toEqual({ label: 'Try the 30-Day Challenge', active: false });
    expect(challengeEntryLabel([], '2026-10-19').label).toBe('Try the 30-Day Challenge');
  });

  it('is a quiet link on Today and renders nothing until enrollments load', async () => {
    const onPress = jest.fn();
    const mutations = { completeAction: jest.fn(), reopenAction: jest.fn(), checkRoutine: jest.fn(), uncheckRoutine: jest.fn() };
    const focus = { addToToday: jest.fn(), removeFromToday: jest.fn() };
    const { rerender } = await render(
      <TodayView data={todayData()} mutations={mutations} focusMutations={focus} challengeEntry={<ChallengeEntry enrollments={undefined} today="2026-10-19" onPress={onPress} />} />,
    );
    expect(screen.queryByTestId('challenge-entry')).toBeNull();
    await rerender(
      <TodayView data={todayData()} mutations={mutations} focusMutations={focus} challengeEntry={<ChallengeEntry enrollments={[enrollment()]} today="2026-10-19" onPress={onPress} />} />,
    );
    await fireEvent.press(screen.getByRole('link', { name: '30-Day Challenge · Day 12 of 30' }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('calendar helpers', () => {
  it('counts only past empty days as missed (today is not over)', () => {
    const s = summary({ days: [] });
    const cells = calendarCells(s);
    expect(cells).toHaveLength(30);
    expect(cells[0]!.date).toBe('2026-10-08');
    expect(cells[29]!.date).toBe('2026-11-06');
    expect(missedDays(cells)).toBe(11);
  });
});
