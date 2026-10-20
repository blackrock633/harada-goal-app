// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { formatPercent, formatLocalDate, relativeDay, describeSchedule, paceLabel } from './format';

describe('formatPercent', () => {
  it('formats decimals to percentages', () => {
    expect(formatPercent(0.42)).toBe('42%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0)).toBe('0%');
  });

  it('handles null', () => {
    expect(formatPercent(null)).toBe('—');
  });
});

describe('formatLocalDate', () => {
  it('formats medium by default', () => {
    expect(formatLocalDate('2026-10-06')).toMatch(/Oct 6/);
  });
});

describe('relativeDay', () => {
  it('identifies today', () => {
    expect(relativeDay('2026-10-06', '2026-10-06')).toBe('Today');
  });
  it('identifies yesterday', () => {
    expect(relativeDay('2026-10-05', '2026-10-06')).toBe('Yesterday');
  });
  it('identifies tomorrow', () => {
    expect(relativeDay('2026-10-07', '2026-10-06')).toBe('Tomorrow');
  });
});

describe('describeSchedule', () => {
  it('describes daily', () => {
    expect(describeSchedule({ type: 'daily' })).toBe('Every day');
  });
  it('describes weekdays', () => {
    expect(describeSchedule({ type: 'weekdays', days: [1, 3, 5] })).toBe('Mon · Wed · Fri');
  });
  it('describes weekly', () => {
    expect(describeSchedule({ type: 'weekly', timesPerWeek: 3 })).toBe('3× a week');
  });
});

describe('paceLabel', () => {
  it('returns human readable labels', () => {
    expect(paceLabel('on_track')).toBe('On track');
    expect(paceLabel('ahead')).toBe('Ahead');
  });
});
