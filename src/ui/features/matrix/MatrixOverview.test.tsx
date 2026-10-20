// @vitest-environment jsdom
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MatrixOverview } from './MatrixOverview';
import { mkGoal, sampleGoal, mkOutcome } from './fixtures.test-util';

describe('MatrixOverview', () => {
  it('renders goal + 8 tiles with empty slots inviting add, and labelled eyebrows', () => {
    render(<MatrixOverview goal={sampleGoal()} />);
    const grid = screen.getByTestId('overview-grid');
    expect(within(grid).getAllByRole('link')).toHaveLength(9);
    expect(within(grid).getAllByText('Add key area')).toHaveLength(6);
    expect(screen.getByText('Goal')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Key area 3: Fitness/ })).toHaveAttribute('href', expect.stringContaining('/matrix/2?goal='));
    expect(screen.getByText('3/8 actions')).toBeInTheDocument();
  });

  it('shows 72-position completeness and "Actions: X of Y done" with real denominators', () => {
    render(<MatrixOverview goal={sampleGoal()} />);
    const c = screen.getByTestId('completeness');
    expect(c).toHaveTextContent('Plan: 5 of 72 positions filled');
    expect(c).toHaveTextContent('2 of 8 key areas · 3 of 64 actions');
    expect(c).toHaveTextContent('Actions: 1 of 3 done');
    expect(c.textContent).not.toMatch(/%/);
  });

  it('works with a single key area', () => {
    render(<MatrixOverview goal={mkGoal([mkOutcome(0, 'Only')])} />);
    expect(screen.getByTestId('completeness')).toHaveTextContent('Plan: 1 of 72 positions filled');
  });
});
