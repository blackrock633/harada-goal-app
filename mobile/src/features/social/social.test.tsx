import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import type { GoalSummaryDTO } from '@shared/application/dto';
import type { SocialPostDTO } from '@shared/application/social';
import { pageIndexForPath } from '@/ui/navigation';

import { AchieveGoal } from '../goal/AchieveGoal';
import { statPairs } from './format';
import { PostCard } from './PostCard';
import { PostComposer } from './PostComposer';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn() },
}));

const mockLike = jest.fn();
const mockCreate = jest.fn();
const mockDelete = jest.fn();
const mockReport = jest.fn();
jest.mock('@/data/social', () => ({
  togglePostLike: (...a: unknown[]) => mockLike(...a),
  createSocialPost: (...a: unknown[]) => mockCreate(...a),
  deleteSocialPost: (...a: unknown[]) => mockDelete(...a),
  hideOrReportPost: (...a: unknown[]) => mockReport(...a),
  usePostImage: () => ({ data: undefined }),
  useInvalidateSocial: () => jest.fn(),
}));
const mockPick = jest.fn();
jest.mock('@/data/photos', () => ({ pickPhoto: (...a: unknown[]) => mockPick(...a) }));

const wrap = (ui: ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

function post(over: Partial<SocialPostDTO> = {}): SocialPostDTO {
  return {
    id: 'p1', type: 'progress_update', visibility: 'public', headline: 'Week 8 long run', body: 'Felt strong.', hasImage: false,
    stats: { tasksDone: 4, tasksTotal: 9, keyAreas: 3 }, goal: { id: 'g1', title: 'Run a marathon', status: 'active', achievedAt: null, visibility: 'public' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isOwnPost: false,
    author: { userId: 'u2', username: 'bo', displayName: 'Bo Lee', avatarUrl: null },
    likeCount: 2, commentCount: 1, likedByViewer: false, recentComments: [], ...over,
  };
}

const goal = (over: Partial<GoalSummaryDTO> = {}) => ({ id: 'g1', title: 'Run a marathon', status: 'active', ...over }) as GoalSummaryDTO;

beforeEach(() => {
  [mockPush, mockReplace, mockLike, mockCreate, mockDelete, mockReport, mockPick].forEach((m) => m.mockReset());
});

describe('navigation', () => {
  it('only a page root counts as a page (sub-screens never swipe)', () => {
    expect(pageIndexForPath('/today')).toBe(0);
    expect(pageIndexForPath('/review/')).toBe(3);
    expect(pageIndexForPath('/matrix/2')).toBe(-1);
    expect(pageIndexForPath('/goal/new')).toBe(-1);
  });
});

describe('PostCard', () => {
  it('shows who, what and the verified numbers, and likes optimistically', async () => {
    mockLike.mockResolvedValue({ ok: true, data: { postId: 'p1', liked: true, likeCount: 3 } });
    await wrap(<PostCard post={post()} />);
    expect(screen.getByText('Bo Lee')).toBeOnTheScreen();
    expect(screen.getByText('PROGRESS UPDATE')).toBeOnTheScreen();
    expect(screen.getByText('4/9')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Like, 2 likes' }));
    expect(mockLike).toHaveBeenCalledWith('p1', true);
    expect(await screen.findByRole('button', { name: 'Unlike, 3 likes' })).toBeOnTheScreen();
  });

  it('rolls a like back when the server refuses it', async () => {
    mockLike.mockResolvedValue({ ok: false, error: { code: 'UNAVAILABLE', message: 'x' } });
    await wrap(<PostCard post={post()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Like, 2 likes' }));
    expect(await screen.findByRole('button', { name: 'Like, 2 likes' })).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toBeOnTheScreen();
  });

  it('offers delete on your own post, and hide/report on others', async () => {
    const { unmount } = await wrap(<PostCard post={post({ isOwnPost: true })} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Post options' }));
    expect(screen.getByRole('button', { name: 'Delete post' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Report' })).toBeNull();
    await unmount();
    await wrap(<PostCard post={post()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Post options' }));
    expect(screen.getByRole('button', { name: 'Report' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Delete post' })).toBeNull();
  });

  it('never shows numbers the server did not send', () => {
    expect(statPairs(null)).toEqual([]);
    expect(statPairs({ keyAreas: 2 })).toEqual([{ label: 'Key areas', value: '2' }]);
  });
});

describe('PostComposer', () => {
  it('needs a headline or text, then posts with the photo and an explicit goal-public choice', async () => {
    mockPick.mockResolvedValue({ dataUri: 'data:image/jpeg;base64,/9j/AAAA', width: 4, height: 3 });
    mockCreate.mockResolvedValue({ ok: true, data: post({ id: 'new1' }) });
    await wrap(<PostComposer goals={[goal()]} initialGoalId="g1" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    expect(mockCreate).not.toHaveBeenCalled();
    expect(screen.getByText('Write a headline or a few words')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Headline'), '  First 20 km  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Add photo' }));
    await waitFor(() => expect(mockPick).toHaveBeenCalledWith('post'));
    await fireEvent.press(screen.getByRole('checkbox', { name: /Make this goal public/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0]![0]).toMatchObject({
      type: 'progress_update', goalId: 'g1', visibility: 'public', headline: 'First 20 km',
      imageUrl: 'data:image/jpeg;base64,/9j/AAAA', includeStats: true, makeGoalPublic: true,
    });
    expect(mockReplace).toHaveBeenCalledWith('/community/post/new1');
  });

  it('a retry after a failure reuses the same client id (no double post)', async () => {
    mockCreate.mockResolvedValueOnce({ ok: false, error: { code: 'UNAVAILABLE', message: 'x' } }).mockResolvedValueOnce({ ok: true, data: post({ id: 'n2' }) });
    await wrap(<PostComposer goals={[goal()]} />);
    await fireEvent.changeText(screen.getByLabelText('Headline'), 'Update');
    await fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
    expect(mockCreate.mock.calls[1]![0].id).toBe(mockCreate.mock.calls[0]![0].id);
  });

  it('offers "Achieved a goal" only for an achieved goal; "Only me" never makes a goal public', async () => {
    mockCreate.mockResolvedValue({ ok: true, data: post({ id: 'n3' }) });
    await wrap(<PostComposer goals={[goal()]} />);
    expect(screen.queryByRole('radio', { name: 'Achieved a goal' })).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Only me' }));
    expect(screen.queryByRole('checkbox', { name: /Make this goal public/ })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Headline'), 'Private note');
    await fireEvent.press(screen.getByRole('button', { name: 'Save privately' }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0]![0]).toMatchObject({ visibility: 'private', makeGoalPublic: false });
  });
});

describe('AchieveGoal', () => {
  it('asks first, then offers sharing as an option', async () => {
    const mark = jest.fn(async () => ({ ok: true as const, data: {} as never }));
    await wrap(<AchieveGoal goalId="g1" title="Run a marathon" markGoalAchieved={mark} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Mark goal achieved' }));
    expect(mark).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Mark achieved' }));
    expect(mark).toHaveBeenCalledWith({ goalId: 'g1' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Share this achievement' }));
    expect(mockPush).toHaveBeenCalledWith('/share?goalId=g1&type=goal_completed');
  });
});
