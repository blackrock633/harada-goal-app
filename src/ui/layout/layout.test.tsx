// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Screen, ScreenHeader, Section, BottomSheet } from './index';

describe('Screen', () => {
  it('uses 720px for reading width', () => {
    const { container } = render(<Screen width="reading">x</Screen>);
    expect(container.firstElementChild?.className).toContain('max-w-[720px]');
  });
});

describe('ScreenHeader', () => {
  it('wraps a 200-character title instead of overflowing', () => {
    const title = 'a'.repeat(200);
    render(<ScreenHeader title={title} back={{ href: '/goal', label: 'Back' }} />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe(title);
    expect(h1.className).toContain('break-words');
    expect(h1.className).toContain('[overflow-wrap:anywhere]');
    expect(screen.getByRole('link', { name: 'Back' }).className).toContain('min-h-11');
  });
});

describe('Section', () => {
  it('labels the region by its heading', () => {
    render(<Section title="Outcomes">body</Section>);
    expect(screen.getByRole('region', { name: 'Outcomes' })).toBeInTheDocument();
  });
});

describe('BottomSheet', () => {
  it('has an accessible name and closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <BottomSheet title="Edit action" trigger={<button>Open</button>} footer={<button>Save</button>}>
        <input aria-label="Title" />
      </BottomSheet>
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog', { name: 'Edit action' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
