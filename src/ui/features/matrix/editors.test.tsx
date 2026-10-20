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
      <ActionEditorSheet open onOpenChange={onOpenChange} mode={{ type: 'add', outcomeId: uid(100) }} mutations={{ addAction, updateAction: vi.fn() }} />,
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
    render(<ActionEditorSheet open onOpenChange={vi.fn()} mode={{ type: 'add', outcomeId: uid(100) }} mutations={{ addAction: vi.fn(), updateAction: vi.fn() }} />);
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
      <ActionEditorSheet open onOpenChange={onOpenChange} mode={{ type: 'add', outcomeId: uid(100) }} mutations={{ addAction: addAction as never, updateAction: vi.fn() }} />,
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
    expect(updateAction.mock.calls[0]![0]).toMatchObject({ actionId: uid(1001), title: 'New title', schedule: null });
  });

  it('copes with 160-char titles and 2000-char notes (counter shown, no schema error)', async () => {
    const user = userEvent.setup();
    const addAction = vi.fn().mockResolvedValue(okAction());
    render(<ActionEditorSheet open onOpenChange={vi.fn()} mode={{ type: 'add', outcomeId: uid(100) }} mutations={{ addAction, updateAction: vi.fn() }} />);
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
    render(<KeyAreaEditor mode={{ type: 'create', goalId: uid(1) }} mutations={{ addOutcome, updateOutcome: vi.fn() }} onDirtyChange={onDirtyChange} onDone={onDone} />);
    await user.click(screen.getByRole('button', { name: 'Create key area' }));
    expect(await screen.findByText('Required')).toBeInTheDocument();
    expect(addOutcome).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Key area title'), 'Fitness');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Create key area' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(addOutcome.mock.calls[0]![0]).toMatchObject({ goalId: uid(1), title: 'Fitness' });
  });
});
