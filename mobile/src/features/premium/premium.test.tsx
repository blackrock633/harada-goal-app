import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { HistoryWeek, PlanInfo, Price } from '@/data/premium';
import type { OutcomeDTO } from '@shared/application/dto';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { OverLimitNotice } from './ChooseActiveGoal';
import { HistoryScreen } from './HistoryScreen';
import { HistoryView } from './HistoryView';
import { PlanSuggestions } from './PlanSuggestions';
import { UpgradePrompt, resetUpgradePromptDismissals } from './UpgradePrompt';
import { UpgradeView, yearlyComparison } from './UpgradeView';
import { describePlan } from './copy';

// ---------- mocks ----------

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: (...a: unknown[]) => mockPush(...a), setParams: jest.fn(), back: jest.fn() },
}));

const mockOpenBrowser = jest.fn(async (_url: string) => ({ type: 'dismiss' }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (url: string) => mockOpenBrowser(url) }));

type Q<T> = { isPending: boolean; isError: boolean; isRefetching: boolean; data: T | undefined; error: unknown; refetch: jest.Mock; isSuccess?: boolean };
const q = <T,>(data: T | undefined, over: Partial<Q<T>> = {}): Q<T> => ({
  isPending: data === undefined,
  isError: false,
  isRefetching: false,
  data,
  error: null,
  refetch: jest.fn(async () => undefined),
  isSuccess: data !== undefined,
  ...over,
});

let mockPlan: Q<PlanInfo>;
let mockPrices: Q<Price[]>;
let mockHistory: Q<HistoryWeek[]>;
const mockRefresh = jest.fn(async () => undefined);
const mockTrack = jest.fn();
const mockCheckout = jest.fn();
const mockPortal = jest.fn();
const mockSuggestActions = jest.fn();
const mockSuggestAreas = jest.fn();
const mockChoose = jest.fn();
const mockUseHistory = jest.fn((..._a: unknown[]) => mockHistory);

jest.mock('@/data/premium', () => ({
  ...jest.requireActual('@/data/premium'),
  usePlan: () => mockPlan,
  usePrices: () => mockPrices,
  useHistory: (...a: unknown[]) => mockUseHistory(...a),
  useRefreshPlan: () => mockRefresh,
  track: (...a: unknown[]) => mockTrack(...a),
  startCheckout: (...a: unknown[]) => mockCheckout(...a),
  openBillingPortal: (...a: unknown[]) => mockPortal(...a),
  suggestActions: (...a: unknown[]) => mockSuggestActions(...a),
  suggestAreas: (...a: unknown[]) => mockSuggestAreas(...a),
  chooseActiveGoal: (...a: unknown[]) => mockChoose(...a),
}));

let mockGoals: Q<{ id: string; title: string } | undefined>;
let mockDetail: Q<{ outcomes: OutcomeDTO[] }>;
let mockAllGoals: Q<{ id: string; title: string; status: string; metrics: { planning: { filled: number; total: number } } }[]>;
jest.mock('@/data/hooks', () => ({
  useFocusedGoal: () => mockGoals,
  useGoalDetail: () => mockDetail,
  useGoals: () => mockAllGoals,
}));

// ---------- fixtures ----------

const PRO_FEATURES: PlanInfo['features'] = ['multiple_goals', 'progress_history', 'advanced_reviews', 'premium_templates', 'ai_planning', 'insights'];
const free = (over: Partial<PlanInfo> = {}): PlanInfo => ({
  plan: 'free', features: [], maxActiveGoals: 1, activeGoals: 1, overLimit: false, subscription: null, grant: null, ...over,
});
const pro = (sub: Partial<NonNullable<PlanInfo['subscription']>> = {}): PlanInfo => ({
  plan: 'pro', features: PRO_FEATURES, maxActiveGoals: null, activeGoals: 2, overLimit: false, grant: null,
  subscription: { status: 'active', priceId: 'pro_monthly', currentPeriodEnd: '2026-11-26T12:00:00Z', cancelAtPeriodEnd: false, hasBillingAccount: true, ...sub },
});
const PRICES: Price[] = [
  { id: 'pro_monthly', amountCents: 1000, currency: 'usd', interval: 'month' },
  { id: 'pro_annual', amountCents: 9600, currency: 'usd', interval: 'year' },
];

beforeEach(() => {
  jest.clearAllMocks();
  resetUpgradePromptDismissals();
  mockPlan = q(free());
  mockPrices = q(PRICES);
  mockHistory = q<HistoryWeek[]>([]);
  mockGoals = q({ id: 'g1', title: 'Run a marathon' });
  mockDetail = q({ outcomes: [] });
  const g = (id: string, title: string) => ({ id, title, status: 'active', metrics: { planning: { filled: 3, total: 72 } } });
  mockAllGoals = q([g('g1', 'Run a marathon'), g('g2', 'Learn piano')]);
});

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

// ---------- upgrade screen ----------

describe('UpgradeView', () => {
  it('Free: a paywall headed by the feature, what Pro adds, both plans (yearly first), renewal terms; tracks the view', async () => {
    await render(<UpgradeView feature="progress_history" />);
    expect(screen.getByTestId('paywall')).toBeOnTheScreen();
    expect(screen.getByTestId('upgrade-focus')).toHaveTextContent(/See your weeks side by side/);
    expect(screen.getByText('Multiple active goals')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /Yearly, \$96\.00 per year/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Monthly, \$10\.00 per month/ })).not.toBeChecked();
    expect(screen.getByText(/Renews yearly until you cancel/)).toBeOnTheScreen();
    expect(mockTrack).toHaveBeenCalledWith('upgrade_page_viewed', { feature: 'progress_history' });
  });

  it('yearly shows the price computed from the database prices, with an honest comparison', async () => {
    await render(<UpgradeView />);
    expect(screen.getByText('$8.00 a month · $24.00 less than monthly')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: /Monthly/ }));
    expect(screen.getByText(/Renews monthly until you cancel/)).toBeOnTheScreen();
    expect(mockTrack).toHaveBeenCalledWith('upgrade_page_viewed', { feature: 'none' });
  });

  it('never claims a saving that is not there', () => {
    expect(yearlyComparison({ ...PRICES[1]!, amountCents: 12000 }, PRICES[0]!)).toEqual({ perMonth: '$10.00', saving: null });
  });

  it('checkout opens Stripe, refetches the plan, and waits for the server instead of claiming success', async () => {
    mockCheckout.mockResolvedValue({ ok: true, data: { url: 'https://checkout.stripe.com/x' } });
    await render(<UpgradeView />);
    await press(/Continue to payment/);
    await waitFor(() => expect(mockOpenBrowser).toHaveBeenCalledWith('https://checkout.stripe.com/x'));
    expect(mockCheckout).toHaveBeenCalledWith('pro_annual');
    expect(mockRefresh).toHaveBeenCalled();
    expect(await screen.findByText(/Your plan updates once Stripe confirms the payment/)).toBeOnTheScreen();
    expect(screen.queryByText(/You have Harada Pro/)).toBeNull();
    expect(screen.queryByText(/welcome|success|upgraded/i)).toBeNull();
  });

  it('NOT_CONFIGURED: says upgrades are not available, opens nothing', async () => {
    mockCheckout.mockResolvedValue({ ok: false, error: { code: 'NOT_CONFIGURED', message: 'x' } });
    await render(<UpgradeView />);
    await press(/Continue to payment/);
    expect(await screen.findByText(/Upgrades aren’t available yet/)).toBeOnTheScreen();
    expect(mockOpenBrowser).not.toHaveBeenCalled();
    expect(screen.queryByText(/Stripe confirms/)).toBeNull();
  });

  it('checkout error: shows it and never claims success', async () => {
    mockCheckout.mockResolvedValue({ ok: false, error: { code: 'UNAVAILABLE', message: 'x' } });
    await render(<UpgradeView />);
    await press(/Continue to payment/);
    expect(await screen.findByText(/Nothing was charged or changed/)).toBeOnTheScreen();
    expect(screen.queryByText(/You have Harada Pro/)).toBeNull();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('no prices configured: honest message, no checkout button', async () => {
    mockPrices = q<Price[]>([]);
    await render(<UpgradeView />);
    expect(screen.getByText(/Upgrades aren’t available yet/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Continue to payment/ })).toBeNull();
  });

  it('Pro: status with renewal date and Manage billing opens the portal', async () => {
    mockPlan = q(pro());
    mockPortal.mockResolvedValue({ ok: true, data: { url: 'https://billing.stripe.com/p' } });
    await render(<UpgradeView />);
    expect(screen.getByText('You have Harada Pro')).toBeOnTheScreen();
    expect(screen.getByText('Renews on November 26, 2026.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Continue to payment/ })).toBeNull();
    await press('Manage billing');
    await waitFor(() => expect(mockOpenBrowser).toHaveBeenCalledWith('https://billing.stripe.com/p'));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('Pro past_due and cancelling are described as the server reports them', () => {
    expect(describePlan(pro({ status: 'past_due' })).lines.some((l) => l.tone === 'warning' && /didn’t go through/.test(l.text))).toBe(true);
    expect(describePlan(pro({ cancelAtPeriodEnd: true })).lines.map((l) => l.text)).toContain(
      'Ends on November 26, 2026. You keep Pro until then, and it won’t renew.',
    );
  });

  it('plan failed to load: error with retry, no offer', async () => {
    mockPlan = q<PlanInfo>(undefined, { isPending: false, isError: true, error: new Error('x') });
    await render(<UpgradeView />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(screen.queryByText(/per month/)).toBeNull();
  });
});

// ---------- prompt ----------

describe('UpgradePrompt', () => {
  it('passive: one lock row whose Unlock opens the paywall; tracks being shown; nothing opens by itself', async () => {
    await render(<UpgradePrompt feature="ai_planning" />);
    expect(screen.getByText('Planning suggestions')).toBeOnTheScreen();
    expect(mockTrack).toHaveBeenCalledWith('upgrade_prompt_shown', { feature: 'ai_planning' });
    expect(mockPush).not.toHaveBeenCalled();
    await press(/Unlock with Harada Pro/);
    expect(mockPush).toHaveBeenCalledWith('/upgrade?feature=ai_planning');
  });

  it('action: trying a Pro feature opens the full paywall at once', async () => {
    await render(<UpgradePrompt feature="multiple_goals" trigger="action" />);
    expect(mockPush).toHaveBeenCalledWith('/upgrade?feature=multiple_goals');
  });

  it('"Not now" hides a passive prompt for the rest of the session, per feature', async () => {
    const { unmount } = await render(<UpgradePrompt feature="insights" />);
    await press('Not now');
    expect(screen.queryByText('Completion by key area')).toBeNull();
    await unmount();
    await render(
      <>
        <UpgradePrompt feature="insights" />
        <UpgradePrompt feature="multiple_goals" />
      </>,
    );
    expect(screen.queryByTestId('upgrade-prompt-insights')).toBeNull();
    expect(screen.getByTestId('upgrade-prompt-multiple_goals')).toBeOnTheScreen();
  });

  it('a gate shows the paywall itself, with no "Not now"', async () => {
    await render(<UpgradePrompt feature="progress_history" trigger="gate" />);
    expect(screen.getByTestId('paywall')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull();
  });
});

// ---------- history ----------

const week = (weekStart: string, over: Partial<HistoryWeek> = {}): HistoryWeek => ({
  weekStart, tasksDue: 0, tasksDueDone: 0, tasksCompleted: 0, routineChecks: 0, reflections: 0, planChanges: 0, ...over,
});

describe('History', () => {
  it('Free: explains and offers Pro, and never requests history', async () => {
    await render(<HistoryScreen goalId="g1" />);
    expect(screen.getByTestId('upgrade-prompt-progress_history')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull();
    expect(mockUseHistory).toHaveBeenCalledWith('g1', 12, false);
  });

  it('Pro: weekly bars, consistency, labelled metrics and the activity note', async () => {
    mockPlan = q(pro());
    mockHistory = q([
      week('2026-10-12', { tasksDue: 4, tasksDueDone: 3, tasksCompleted: 5, routineChecks: 6, reflections: 1 }),
      week('2026-10-19', { tasksDue: 2, tasksDueDone: 2, tasksCompleted: 2 }),
      week('2026-10-05'),
    ]);
    await render(<HistoryScreen goalId="g1" />);
    expect(mockUseHistory).toHaveBeenCalledWith('g1', 12, true);
    expect(screen.getByText('Active in 2 of 3 weeks')).toBeOnTheScreen();
    expect(screen.getByText('3 of 4')).toBeOnTheScreen();
    expect(screen.getByLabelText(/Week of Oct 12: 3 of 4 tasks due were done/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/Week of Oct 12: 6 routine checks/)).toBeOnTheScreen();
    expect(screen.getByText(/These count activity. They don’t measure how close you are to the goal itself./)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: '26 weeks' }));
    expect(mockUseHistory).toHaveBeenLastCalledWith('g1', 26, true);
  });

  it('shows an empty state with fewer than two active weeks', async () => {
    await render(
      <HistoryView goalTitle="G" range={4} onRangeChange={jest.fn()} weeks={[week('2026-10-19', { tasksCompleted: 1 }), week('2026-10-12')]} outcomes={[]} insights />,
    );
    expect(screen.getByText('Not enough history yet')).toBeOnTheScreen();
    expect(screen.queryByText(/Active in/)).toBeNull();
  });

  it('per key area completion for insights; prompt without it', async () => {
    const outcome = { id: 'o1', title: 'Fitness', archivedAt: null, completedTasks: 1, totalTasks: 4, routineCount: 0, routineAdherence: null } as unknown as OutcomeDTO;
    const { rerender } = await render(<HistoryView goalTitle="G" range={4} onRangeChange={jest.fn()} weeks={[]} outcomes={[outcome]} insights />);
    expect(screen.getByText('1 of 4 tasks done')).toBeOnTheScreen();
    await rerender(<HistoryView goalTitle="G" range={4} onRangeChange={jest.fn()} weeks={[]} outcomes={[outcome]} insights={false} />);
    expect(screen.queryByText('1 of 4 tasks done')).toBeNull();
    expect(screen.getByTestId('upgrade-prompt-insights')).toBeOnTheScreen();
  });
});

// ---------- AI planning ----------

describe('PlanSuggestions', () => {
  const actions = {
    ok: true,
    data: {
      task: 'actions',
      actions: [
        { title: 'Run 5k', kind: 'routine', cadence: 'weekly' },
        { title: 'Buy shoes', kind: 'task', cadence: null },
      ],
    },
  };

  it('Free: shows the Pro prompt instead of calling the service', async () => {
    await render(<PlanSuggestions mode="actions" enabled={false} goalTitle="G" areaTitle="A" existingActions={[]} openPositions={8} onAdd={jest.fn()} />);
    await press(/Suggest actions/);
    expect(screen.getByTestId('upgrade-prompt-ai_planning')).toBeOnTheScreen();
    expect(mockSuggestActions).not.toHaveBeenCalled();
  });

  it('discloses what is sent, labels results "Suggested" and adds item by item', async () => {
    mockSuggestActions.mockResolvedValue(actions);
    const onAdd = jest.fn(async () => ({ ok: true as const, data: null }));
    await render(<PlanSuggestions mode="actions" enabled goalTitle="Marathon" areaTitle="Fitness" existingActions={['Stretch']} openPositions={7} onAdd={onAdd} />);
    expect(screen.getByText(/Sends your goal title and the titles on this sheet to Anthropic’s Claude/)).toBeOnTheScreen();
    await press('Suggest actions');
    expect(mockSuggestActions).toHaveBeenCalledWith('Marathon', 'Fitness', ['Stretch']);
    expect(await screen.findByText('Suggested')).toBeOnTheScreen();
    expect(screen.getByText('Routine · weekly')).toBeOnTheScreen();
    await press('Add suggested action: Buy shoes');
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd).toHaveBeenCalledWith({ title: 'Buy shoes', kind: 'task', cadence: null });
    expect(await screen.findByLabelText('Added: Buy shoes')).toBeOnTheScreen();
    // The other suggestion is untouched until the user adds it.
    expect(screen.getByRole('button', { name: 'Add suggested action: Run 5k' })).toBeOnTheScreen();
    expect(mockTrack).toHaveBeenCalledWith('premium_feature_used', { feature: 'ai_planning', task: 'actions' });
  });

  it('a failed add shows its error on that item only', async () => {
    mockSuggestActions.mockResolvedValue(actions);
    const onAdd = jest.fn(async () => ({ ok: false as const, error: { code: 'CONFLICT' as const, message: 'That position was just taken.' } }));
    await render(<PlanSuggestions mode="actions" enabled goalTitle="G" areaTitle="A" existingActions={[]} openPositions={8} onAdd={onAdd} />);
    await press('Suggest actions');
    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: 'Add suggested action: Run 5k' }));
    });
    expect(await screen.findByText('That position was just taken.')).toBeOnTheScreen();
  });

  it('NOT_CONFIGURED and RATE_LIMITED are said plainly', async () => {
    mockSuggestAreas.mockResolvedValueOnce({ ok: false, error: { code: 'NOT_CONFIGURED', message: 'x' } });
    await render(<PlanSuggestions mode="areas" enabled goalTitle="G" successCriteria="" existingAreas={[]} openPositions={8} onAdd={jest.fn()} />);
    await press('Suggest key areas');
    expect(await screen.findByText('Suggestions aren’t available yet.')).toBeOnTheScreen();
    mockSuggestAreas.mockResolvedValueOnce({ ok: false, error: { code: 'RATE_LIMITED', message: 'x' } });
    await press('Suggest key areas');
    expect(await screen.findByText(/a lot of suggestions in a short time/)).toBeOnTheScreen();
    expect(screen.queryByText('Suggested')).toBeNull();
  });

  it('Add is disabled when no position is free', async () => {
    mockSuggestAreas.mockResolvedValue({ ok: true, data: { task: 'areas', measurableOutcome: null, areas: [{ title: 'Sleep', why: 'Recovery' }] } });
    await render(<PlanSuggestions mode="areas" enabled goalTitle="G" successCriteria="" existingAreas={[]} openPositions={0} onAdd={jest.fn()} />);
    await press('Suggest key areas');
    expect(await screen.findByRole('button', { name: 'Add suggested key area: Sleep' })).toBeDisabled();
    expect(screen.getByText('All 8 key areas are filled.')).toBeOnTheScreen();
  });
});

// ---------- over the limit after a downgrade ----------

describe('OverLimitNotice', () => {
  const wrap = (ui: React.ReactElement) => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;

  it('renders nothing within the limit', async () => {
    await render(wrap(<OverLimitNotice plan={free()} />));
    expect(screen.queryByTestId('over-limit-notice')).toBeNull();
  });

  it('lets the user pick the goal to keep, says the others are archived (restorable), and only the server archives', async () => {
    mockChoose.mockResolvedValue({ ok: true, data: [] });
    await render(wrap(<OverLimitNotice plan={free({ activeGoals: 2, overLimit: true })} />));
    expect(screen.getByText(/You have 2 active goals, and your plan includes 1/)).toBeOnTheScreen();
    await press('Choose a goal');
    expect(screen.getByText(/you can restore one later/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Keep this goal active' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Keep Learn piano' }));
    await press('Keep this goal active');
    await waitFor(() => expect(mockChoose).toHaveBeenCalledWith('g2'));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('a failed choice shows the error and archives nothing', async () => {
    mockChoose.mockResolvedValue({ ok: false, error: { code: 'UNAVAILABLE', message: 'x' } });
    await render(wrap(<OverLimitNotice plan={free({ activeGoals: 2, overLimit: true })} />));
    await press('Choose a goal');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Keep Run a marathon' }));
    await press('Keep this goal active');
    expect(await screen.findByText(/Couldn't reach the server/)).toBeOnTheScreen();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
