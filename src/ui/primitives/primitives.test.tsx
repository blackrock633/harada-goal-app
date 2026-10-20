// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from './Button';
import { Field } from './Field';
import { Input } from './Input';
import { ConfirmDialog } from './Dialog';
import { CheckCircle } from './CheckCircle';
import { ProgressBar } from './Progress';

describe('Button', () => {
  it('disables when loading and shows aria-busy', () => {
    render(<Button loading>Submit</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });
});

describe('Field a11y', () => {
  it('wires up hint and error aria attributes', () => {
    const { rerender } = render(
      <Field label="Name" hint="First name only">
        <Input data-testid="input" />
      </Field>
    );
    const input = screen.getByTestId('input');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).toHaveAttribute('aria-describedby');
    
    // Check error overrides hint
    rerender(
      <Field label="Name" error="Required">
        <Input data-testid="input" />
      </Field>
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const errId = input.getAttribute('aria-describedby');
    expect(document.getElementById(errId!)).toHaveTextContent('Required');
  });
});

describe('ConfirmDialog', () => {
  it('gates confirmation behind typed text', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    
    render(
      <ConfirmDialog 
        open={true}
        title="Delete" 
        description="Are you sure?" 
        requireText="Delete" 
        onConfirm={onConfirm} 
      />
    );
    
    const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
    expect(confirmBtn).toBeDisabled();
    
    const input = screen.getByPlaceholderText('Delete');
    await user.type(input, 'Delete');
    expect(confirmBtn).not.toBeDisabled();
    
    await user.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe('CheckCircle', () => {
  it('toggles aria-pressed', () => {
    render(<CheckCircle label="Task" checked={true} />);
    const btn = screen.getByRole('button', { name: 'Task' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('ProgressBar', () => {
  it('handles null progress', () => {
    render(<ProgressBar progress={null} />);
    const progress = screen.getByRole('progressbar');
    expect(progress).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByText('Not measurable yet')).toBeInTheDocument();
  });
});
