import { fireEvent, render, screen } from '@testing-library/react-native';

import { AccountMenuButton } from '@/ui/AccountMenuButton';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

let mockProfile: { data?: { displayName: string; avatarUrl: string | null } } = {};
jest.mock('@/data/social', () => ({ useSocialProfile: () => mockProfile }));

beforeEach(() => {
  mockPush.mockReset();
  mockProfile = {};
});

it('the top-right button opens your profile, not settings', async () => {
  await render(<AccountMenuButton />);
  await fireEvent.press(screen.getByRole('button', { name: 'Your profile' }));
  expect(mockPush).toHaveBeenCalledWith('/community/u/me');
});

it('shows your photo once your profile has loaded, and still opens your profile', async () => {
  mockProfile = { data: { displayName: 'Noah Dockery', avatarUrl: 'data:image/jpeg;base64,/9j/AAAA' } };
  await render(<AccountMenuButton />);
  expect(JSON.stringify(screen.toJSON())).toContain('data:image/jpeg;base64,/9j/AAAA');
  await fireEvent.press(screen.getByRole('button', { name: 'Your profile' }));
  expect(mockPush).toHaveBeenCalledWith('/community/u/me');
});

it('shows your initials when you have no photo', async () => {
  mockProfile = { data: { displayName: 'Noah Dockery', avatarUrl: null } };
  await render(<AccountMenuButton />);
  // The photo is decoration (the button is labelled), so it is hidden from screen readers.
  expect(screen.getByText('ND', { includeHiddenElements: true })).toBeTruthy();
});
