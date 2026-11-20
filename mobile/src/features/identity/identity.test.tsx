import { fireEvent, render, screen } from '@testing-library/react-native';

import type { PrimaryGoalDTO, ProfileAchievementDTO } from '@shared/application/social';
import { fetchSocialProfile, setAchievementVisibility, shareAchievement } from '@/data/social';
import { AchievementRow, FoundingCredential, FoundingMark, PrimaryGoalSummary } from './IdentityViews';

const mockRpc = jest.fn();
jest.mock('@/data/supabase', () => ({ getSupabase: () => ({ rpc: (...a: unknown[]) => mockRpc(...a) }) }));

beforeEach(() => mockRpc.mockReset());

const goal: PrimaryGoalDTO = {
  id: 'g-1',
  title: 'Make the New York Philharmonic',
  status: 'active',
  activatedOn: '2026-08-04',
  targetDate: null,
  achievedAt: null,
  metrics: {
    daysPursuing: 84,
    actionsCompleted: 237,
    tasksCompleted: 40,
    tasksTotal: 56,
    routineCheckins: 197,
    keyAreasComplete: 6,
    keyAreasTotal: 8,
    consistency: { activeDays: 26, windowDays: 30, rate: 0.8667 },
  },
};

const achievement: ProfileAchievementDTO = {
  id: 'a-1',
  key: 'active_days_30',
  title: '30 Days of Progress',
  earnedAt: '2026-09-10T00:00:00Z',
  stat: { days: 30 },
  hidden: false,
  goal: null,
  postId: null,
};

describe('identity views (mobile)', () => {
  it('shows the founding credential and mark with accessible names', async () => {
    await render(
      <>
        <FoundingCredential number={42} since="2026-10-01T00:00:00Z" />
        <FoundingMark number={42} />
      </>,
    );
    expect(screen.getByText('No. 0042')).toBeTruthy();
    expect(screen.getByLabelText(/Harada Founding Member No\. 0042/)).toBeTruthy();
    expect(screen.getByLabelText('Founding Member No. 0042')).toBeTruthy();
  });

  it('shows the featured goal metrics computed by the server', async () => {
    await render(<PrimaryGoalSummary goal={goal} />);
    expect(screen.getByText('Make the New York Philharmonic')).toBeTruthy();
    expect(screen.getByText('84')).toBeTruthy();
    expect(screen.getByText('237')).toBeTruthy();
    expect(screen.getByText('87%')).toBeTruthy();
    expect(screen.getByText('6/8')).toBeTruthy();
  });

  it('owner controls share and hide an achievement', async () => {
    const onShare = jest.fn();
    const onToggle = jest.fn();
    await render(<AchievementRow achievement={achievement} owner onShare={onShare} onToggleHidden={onToggle} />);
    await fireEvent.press(screen.getByText('Share'));
    await fireEvent.press(screen.getByLabelText('Hide 30 Days of Progress on my profile'));
    expect(onShare).toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalled();
  });
});

describe('social data layer (mobile)', () => {
  it('sends every social RPC its jsonb argument as p_input (regression: was `p`)', async () => {
    mockRpc.mockResolvedValue({ data: {}, error: null });
    await fetchSocialProfile({});
    await shareAchievement('a-1');
    await setAchievementVisibility('a-1', true);
    expect(mockRpc.mock.calls).toEqual([
      ['get_social_profile', { p_input: {} }],
      ['create_social_post', { p_input: { type: 'achievement', achievementId: 'a-1', visibility: 'public' } }],
      ['set_achievement_visibility', { p_input: { achievementId: 'a-1', hidden: true } }],
    ]);
  });
});

describe('older backend (before the identity migration)', () => {
  it('a profile without identity fields loads with empty identity data instead of crashing', async () => {
    mockRpc.mockResolvedValue({ data: { userId: 'u-1', username: 'maya', displayName: 'Maya' }, error: null });
    const res = await fetchSocialProfile({});
    expect(res.ok && res.data).toMatchObject({ achievements: [], foundingMember: null, primaryGoal: null, privacy: null });
  });
});
