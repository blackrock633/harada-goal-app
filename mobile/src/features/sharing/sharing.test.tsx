import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import type { ReactElement } from 'react';
import { captureRef } from 'react-native-view-shot';

import type { Card, CardInput } from '@/data/premium';
import { ShareComposer } from './ShareComposer';
import { buildInput, EMPTY_STATE } from './formats';

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

const mockPreview = jest.fn();
const mockTrack = jest.fn();
jest.mock('@/data/premium', () => ({
  ...jest.requireActual('@/data/premium'),
  previewCard: (i: unknown) => mockPreview(i),
  track: (...a: unknown[]) => mockTrack(...a),
}));

/** The server's card for an input: echoes the ticked fields, with stored numbers. */
function serverCard(input: CardInput): Card {
  return {
    kind: input.kind,
    ...(input.show.goalTitle ? { goalTitle: 'Run a marathon' } : {}),
    ...(input.show.name ? { name: 'Ada' } : {}),
    ...(input.show.stats ? { stats: { tasksDone: 4, tasksTotal: 9, keyAreas: 8, actionsPlanned: 40 } } : {}),
    ...(input.accomplishment ? { accomplishment: input.accomplishment } : {}),
    ...(input.milestone ? { milestone: input.milestone } : {}),
    ...(input.lesson ? { lesson: input.lesson } : {}),
    ...(input.nextPriority ? { nextPriority: input.nextPriority } : {}),
  };
}

const lastInput = () => mockPreview.mock.calls.at(-1)![0] as CardInput;

async function renderComposer(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockPreview.mockReset().mockImplementation(async (i: CardInput) => ({ ok: true, data: serverCard(i) }));
  mockTrack.mockReset();
  (captureRef as jest.Mock).mockReset().mockResolvedValue('file:///tmp/card.png');
  (Sharing.isAvailableAsync as jest.Mock).mockReset().mockResolvedValue(true);
  (Sharing.shareAsync as jest.Mock).mockReset().mockResolvedValue(undefined);
});

describe('ShareComposer', () => {
  it('starts with goal title, numbers and name hidden', async () => {
    await renderComposer(<ShareComposer goalId="g1" kind="progress" />);
    await waitFor(() => expect(mockPreview).toHaveBeenCalled());
    expect(lastInput()).toEqual({ goalId: 'g1', kind: 'progress', show: { goalTitle: false, stats: false, name: false } });
    for (const name of ['Goal title', 'Numbers', 'Your name']) expect(screen.getByRole('checkbox', { name })).not.toBeChecked();
    expect(await screen.findByTestId('share-card')).toBeOnTheScreen();
    expect(screen.queryByText('Run a marathon')).toBeNull();
  });

  it('ticking fields and typing text changes what is sent, and the preview is the server card', async () => {
    await renderComposer(<ShareComposer goalId="g1" kind="progress" />);
    await waitFor(() => expect(mockPreview).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Goal title' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Numbers' }));
    await fireEvent.changeText(screen.getByLabelText('An accomplishment'), '  First 20 km run  ');
    await waitFor(() => expect(lastInput()).toEqual({
      goalId: 'g1', kind: 'progress', show: { goalTitle: true, stats: true, name: false }, accomplishment: 'First 20 km run',
    }));
    // Debounced: three quick changes, one more request.
    expect(mockPreview).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Run a marathon')).toBeOnTheScreen();
    expect(screen.getByText('4 of 9')).toBeOnTheScreen();
    expect(screen.getByText('First 20 km run')).toBeOnTheScreen();
    // Numbers are never sent from the device.
    expect(JSON.stringify(lastInput())).not.toMatch(/tasksDone|keyAreas/);
  });

  it('weekly card offers a lesson and next week\'s priority; empty fields stay off', () => {
    const input = buildInput('g1', 'weekly', { ...EMPTY_STATE, text: { lesson: 'Sleep first', nextPriority: ' ', accomplishment: 'not offered' } });
    expect(input).toEqual({ goalId: 'g1', kind: 'weekly', show: { goalTitle: false, stats: false, name: false }, lesson: 'Sleep first' });
  });

  it('exports the chosen format with captureRef and opens the share sheet', async () => {
    await renderComposer(<ShareComposer goalId="g1" kind="challenge" />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Story' }));
    const button = await screen.findByRole('button', { name: 'Share image (Story)' });
    await waitFor(() => expect(button).toBeEnabled());
    await fireEvent.press(button);
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///tmp/card.png', expect.objectContaining({ mimeType: 'image/png' })));
    expect(captureRef).toHaveBeenCalledWith(expect.anything(), { format: 'png', width: 1080, height: 1920, result: 'tmpfile' });
    expect(mockTrack).toHaveBeenCalledWith('progress_card_generated', { kind: 'challenge', format: 'story' });
  });

  it('says so when the device cannot share files', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    await renderComposer(<ShareComposer goalId="g1" kind="progress" />);
    const button = await screen.findByRole('button', { name: 'Share image (Square)' });
    await waitFor(() => expect(button).toBeEnabled());
    await fireEvent.press(button);
    expect(await screen.findByRole('alert')).toHaveTextContent("Sharing images isn't available on this device.");
    expect(captureRef).not.toHaveBeenCalled();
  });

  it('offers no public link: the image is made on the device and shared by the user', async () => {
    await renderComposer(<ShareComposer goalId="g1" kind="progress" />);
    expect(screen.queryByText(/public link/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Create (public )?link/i })).toBeNull();
  });
});
