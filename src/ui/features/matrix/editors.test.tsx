// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionEditorSheet } from './ActionEditorSheet';
import { KeyAreaEditor } from './KeyAreaEditor';
import { mkAction, uid } from './fixtures.test-util';

const okAction = (a = mkAction({ n: 1 })) => ({ ok: true as const, data: a });

describe('ActionEditorSheet', () => {
  it('shows schema errors, keeps input, and does not call the server or close', async () => {
    const user = userEvent.setup();
    const addAction = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ActionEditorSheet open onOpenChange={onOpenChange} mode={{ type: 'add', outcomeId: uid(100), position: 3 }} mutations={{ addAction, updateAction: vi.fn() }} />,
    );
    await user.type(screen.getByLabelText('Notes'), 'keep me');
    await user.click(screen.getByRole('button', { name: 'Add action' }));
    expect(await screen.findByText('Required')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toHaveValue('keep me');
    expect(addAction).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('requires at least one weekday for routines', async () => {
    const user = userEvent.setup();
    render(<ActionEditorSheet open onOpenChange={vi.fn()} mode={{ type: 'add', outcomeId: uid(100), position: 3 }} mutations={{ addAction: vi.fn(), updateAction: vi.fn() }} />);
    await user.type(screen.getByLabelText('Title'), 'Stretch');
    await user.selectOptions(screen.getByLabelText('Type'), 'routine');
    await user.selectOptions(screen.getByLabelText('Schedule'), 'weekdays');
    await user.click(screen.getByRole('button', { name: 'Add action' }));
    expect(await screen.findByText('Pick at least one day')).toBeInTheDocument();
  });

  it('is disabled while pending, then closes only on ok', async () => {
    const user = userEvent.setup();
    let resolve!: (v: unknown) => void;
    const addAction = vi.fn(() => new Promise((r) => { resolve = r; }));
    const onOpenChange = vi.fn();
    render(
      <ActionEditorSheet open onOpenChange={onOpenChange} mode={{ type: 'add', outcomeId: uid(100), position: 3 }} mutations={{ addAction: addAction as never, updateAction: vi.fn() }} />,
    );
    await user.type(screen.getByLabelText('Title'), 'Run');
    await user.click(screen.getByRole('button', { name: 'Add action' }));
    const saving = await screen.findByRole('button', { name: 'Saving…' });
    expect(saving).toBeDisabled();
    await user.click(saving);
    expect(addAction).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    resolve(okAction());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows server field errors and message on failure, keeps input and stays open', async () => {
    const user = userEvent.setup();
    const updateAction = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'VALIDATION', message: 'Could not save', fieldErrors: { title: ['Already used'] } },
    });
    const onOpenChange = vi.fn();
    render(
      <ActionEditorSheet open onOpenChange={onOpenChange} mode={{ type: 'edit', action: mkAction({ n: 1, title: 'Old' }) }} mutations={{ addAction: vi.fn(), updateAction }} />,
    );
    const title = screen.getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'New title');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Already used')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    expect(title).toHaveValue('New title');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(updateAction.mock.calls[0]![0]).toMatchObject({ actionId: uid(1001), title: 'New title', schedule: null, expectedUpdatedAt: '2026-01-01T00:00:00.000Z' });
  });

  it('copes with 160-char titles and 2000-char notes (counter shown, no schema error)', async () => {
    const user = userEvent.setup();
    const addAction = vi.fn().mockResolvedValue(okAction());
    render(<ActionEditorSheet open onOpenChange={vi.fn()} mode={{ type: 'add', outcomeId: uid(100), position: 3 }} mutations={{ addAction, updateAction: vi.fn() }} />);
    await user.click(screen.getByLabelText('Title'));
    await user.paste('t'.repeat(160));
    await user.click(screen.getByLabelText('Notes'));
    await user.paste('n'.repeat(2000));
    await user.click(screen.getByRole('button', { name: 'Add action' }));
    await waitFor(() => expect(addAction).toHaveBeenCalled());
  });
});

describe('KeyAreaEditor', () => {
  it('validates, reports dirty state, and creates', async () => {
    const user = userEvent.setup();
    const addOutcome = vi.fn().mockResolvedValue({ ok: true, data: { id: uid(100), title: 'Fitness', description: '' } });
    const onDirtyChange = vi.fn();
    const onDone = vi.fn();
    render(<KeyAreaEditor mode={{ type: 'create', goalId: uid(1), position: 4 }} mutations={{ addOutcome, updateOutcome: vi.fn() }} onDirtyChange={onDirtyChange} onDone={onDone} />);
    await user.click(screen.getByRole('button', { name: 'Create key area' }));
    expect(await screen.findByText('Required')).toBeInTheDocument();
    expect(addOutcome).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Key area title'), 'Fitness');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Create key area' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(addOutcome.mock.calls[0]![0]).toMatchObject({ goalId: uid(1), title: 'Fitness', position: 4 });
  });
});

describe('mutation errors and idempotency', () => {
  const unavailable = { ok: false as const, error: { code: 'UNAVAILABLE' as const, message: 'down' } };

  it('passes position and a stable client id across a retry after UNAVAILABLE (action)', async () => {
    const user = userEvent.setup();
    const addAction = vi.fn().mockResolvedValueOnce(unavailable).mockResolvedValueOnce(okAction());
    const onOpenChange = vi.fn();
    render(<ActionEditorSheet open onOpenChange={onOpenChange} mode={{ type: 'add', outcomeId: uid(100), position: 5 }} mutations={{ addAction, updateAction: vi.fn() }} />);
    await user.type(screen.getByLabelText('Title'), 'Run');
    await user.click(screen.getByRole('button', { name: 'Add action' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the server");
    expect(screen.getByLabelText('Title')).toHaveValue('Run');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.queryByRole('button', { name: 'Reload latest' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add action' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const [first, second] = [addAction.mock.calls[0]![0], addAction.mock.calls[1]![0]];
    expect(first.position).toBe(5);
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.id).toBe(first.id);
  });

  it('uses a stable client id across a retry after UNAVAILABLE (key area)', async () => {
    const user = userEvent.setup();
    const addOutcome = vi.fn().mockResolvedValueOnce(unavailable).mockResolvedValueOnce({ ok: true, data: { id: uid(100), title: 'F', description: '' } });
    const onDone = vi.fn();
    render(<KeyAreaEditor mode={{ type: 'create', goalId: uid(1), position: 2 }} mutations={{ addOutcome, updateOutcome: vi.fn() }} onDone={onDone} />);
    await user.type(screen.getByLabelText('Key area title'), 'F');
    await user.click(screen.getByRole('button', { name: 'Create key area' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Key area title')).toHaveValue('F');
    await user.click(screen.getByRole('button', { name: 'Create key area' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(addOutcome.mock.calls[1]![0].id).toBe(addOutcome.mock.calls[0]![0].id);
    expect(addOutcome.mock.calls[0]![0].position).toBe(2);
  });

  it('CONFLICT on edit keeps input and offers Reload latest', async () => {
    const user = userEvent.setup();
    const updateAction = vi.fn().mockResolvedValue({ ok: false, error: { code: 'CONFLICT', message: 'Changed elsewhere' } });
    const onReloadLatest = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ActionEditorSheet open onOpenChange={onOpenChange} mode={{ type: 'edit', action: mkAction({ n: 1, title: 'Old' }) }} mutations={{ addAction: vi.fn(), updateAction }} onReloadLatest={onReloadLatest} />,
    );
    const title = screen.getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Mine');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Changed elsewhere');
    expect(title).toHaveValue('Mine');
    await user.click(screen.getByRole('button', { name: 'Reload latest' }));
    expect(onReloadLatest).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('passes expectedUpdatedAt on key area edit and shows Reload latest on CONFLICT', async () => {
    const user = userEvent.setup();
    const updateOutcome = vi.fn().mockResolvedValue({ ok: false, error: { code: 'CONFLICT', message: 'Stale' } });
    const onReloadLatest = vi.fn();
    render(
      <KeyAreaEditor
        mode={{ type: 'edit', outcome: { id: uid(100), title: 'Old', description: '', updatedAt: '2026-02-02T00:00:00.000Z' } }}
        mutations={{ addOutcome: vi.fn(), updateOutcome }}
        onReloadLatest={onReloadLatest}
      />,
    );
    await user.type(screen.getByLabelText('Key area title'), ' x');
    await user.click(screen.getByRole('button', { name: 'Save key area' }));
    await user.click(await screen.findByRole('button', { name: 'Reload latest' }));
    expect(updateOutcome.mock.calls[0]![0]).toMatchObject({ outcomeId: uid(100), expectedUpdatedAt: '2026-02-02T00:00:00.000Z' });
    expect(screen.getByLabelText('Key area title')).toHaveValue('Old x');
    expect(onReloadLatest).toHaveBeenCalled();
  });
});
