import { expect, test, describe } from 'vitest';
import { isValidLocalDate, addDays, diffDays, weekdayOf, isoWeekStart, isoWeekEnd, eachDay, localDateInZone, monthDays } from './dates.js';

describe('dates', () => {
  test('isValidLocalDate', () => {
    expect(isValidLocalDate('2024-01-01')).toBe(true);
    expect(isValidLocalDate('2024-13-01')).toBe(false);
    expect(isValidLocalDate('invalid')).toBe(false);
  });

  test('addDays', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // leap year
    expect(addDays('2024-01-01', -1)).toBe('2023-12-31');
  });

  test('diffDays', () => {
    expect(diffDays('2024-01-01', '2024-01-02')).toBe(1);
    expect(diffDays('2024-01-02', '2024-01-01')).toBe(-1);
    expect(diffDays('2024-01-01', '2024-01-01')).toBe(0);
  });

  test('weekdayOf', () => {
    // 2024-01-01 is a Monday -> 1
    expect(weekdayOf('2024-01-01')).toBe(1);
    expect(weekdayOf('2024-01-07')).toBe(0); // Sunday
  });

  test('isoWeek', () => {
    expect(isoWeekStart('2024-01-03')).toBe('2024-01-01'); // Wed -> Mon
    expect(isoWeekEnd('2024-01-03')).toBe('2024-01-07');   // Wed -> Sun
    expect(isoWeekStart('2024-01-07')).toBe('2024-01-01'); // Sun -> Mon
  });

  test('eachDay', () => {
    expect(eachDay('2024-01-01', '2024-01-03')).toEqual(['2024-01-01', '2024-01-02', '2024-01-03']);
    expect(eachDay('2024-01-02', '2024-01-01')).toEqual([]);
  });

  test('localDateInZone', () => {
    const d = new Date('2024-01-02T03:00:00Z');
    // In UTC, it's Jan 2. In America/Los_Angeles, it's Jan 1 (19:00).
    expect(localDateInZone(d, 'America/Los_Angeles')).toBe('2024-01-01');
    expect(localDateInZone(d, 'Invalid/Zone')).toBe('2024-01-02'); // fallback to UTC
  });

  test('monthDays', () => {
    const days = monthDays('2024-02');
    expect(days.length).toBe(29);
    expect(days[0]).toBe('2024-02-01');
    expect(days[28]).toBe('2024-02-29');
  });
});
