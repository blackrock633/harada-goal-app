// @vitest-environment jsdom
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pathnameMock = vi.fn<() => string>();
const searchMock = vi.fn<() => URLSearchParams>(() => new URLSearchParams());
vi.mock('next/navigation', () => ({ usePathname: () => pathnameMock(), useSearchParams: () => searchMock() }));

import { AppShell } from './AppShell';

function bottomNav(): HTMLElement {
  const navs = screen.getAllByRole('navigation', { name: 'Primary' });
  const nav = navs[navs.length - 1];
  if (!nav) throw new Error('no nav');
  return nav;
}

function setup(goalId?: string) {
  return render(
    <AppShell user={{ displayName: 'Ann' }} focusedGoalId={goalId} signOutAction={async () => {}}>
      <p>content</p>
    </AppShell>
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/today');
    searchMock.mockReturnValue(new URLSearchParams());
  });

  it('carries ?goal= from the current URL into goal-scoped tabs', () => {
    searchMock.mockReturnValue(new URLSearchParams('goal=g-42'));
    setup();
    expect(within(bottomNav()).getByRole('link', { name: /Matrix/ })).toHaveAttribute('href', '/matrix?goal=g-42');
  });

  it('renders four tabs with hrefs carrying the focused goal', () => {
    setup('g1');
    const nav = bottomNav();
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Today', 'My Goal', 'Matrix', 'Review']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/today',
      '/goal?goal=g1',
      '/matrix?goal=g1',
      '/review?goal=g1',
    ]);
  });

  it('omits ?goal= when no goal is focused', () => {
    setup();
    expect(within(bottomNav()).getByRole('link', { name: 'Matrix' })).toHaveAttribute('href', '/matrix');
  });

  it('marks the active tab with aria-current by pathname prefix', () => {
    pathnameMock.mockReturnValue('/matrix/3');
    setup('g1');
    const nav = bottomNav();
    expect(within(nav).getByRole('link', { name: 'Matrix' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Today' })).not.toHaveAttribute('aria-current');
  });

  it('exposes the skip target', () => {
    const { container } = setup();
    expect(container.querySelector('main#main-content')).not.toBeNull();
  });
});
