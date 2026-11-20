import { describe, expect, it } from 'vitest';
import { describeDates, describeMonthly, ordinal, shortDate } from './schedule-text';

describe('schedule text', () => {
  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st',
    ]);
  });
  it('monthly', () => {
    expect(describeMonthly([1])).toBe('Monthly on the 1st');
    expect(describeMonthly([15, 1])).toBe('Monthly on the 1st and 15th');
    expect(describeMonthly([1, 10, 20])).toBe('Monthly on the 1st, 10th and 20th');
    expect(describeMonthly([31])).toBe('Monthly on the 31st (or last day)');
  });
  it('dates', () => {
    expect(shortDate('2026-11-07', 2026)).toBe('Nov 7');
    expect(shortDate('2027-01-02', 2026)).toBe('Jan 2, 2027');
    expect(describeDates(['2026-12-12', '2026-11-07'], 2026)).toBe('Nov 7 · Dec 12');
    expect(describeDates(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'], 2026)).toBe(
      'Nov 1 · Nov 2 · Nov 3 · +2 more',
    );
  });
});
