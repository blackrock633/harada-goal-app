import { describe, expect, it } from 'vitest';
import { normalizeSchedule } from './action.js';
import { isDueToday } from './next.js';
import { routineAdherence, routineStreak } from './progress.js';
import { daysInMonth, isScheduledOn } from './schedule.js';
import type { Action, Schedule } from './types.js';

const routine = (schedule: Schedule, startDate = '2026-01-01'): Action => ({
  id: 'a', goalId: 'g', outcomeId: 'o', title: 'R', notes: '', kind: 'routine', position: 0, dueDate: null,
  completedAt: null, schedule, startDate, archivedAt: null, createdAt: new Date(), updatedAt: new Date(),
});

describe('monthly schedules', () => {
  const firstAndFifteenth: Schedule = { type: 'monthly', daysOfMonth: [1, 15] };

  it('is due on the chosen days of each month only', () => {
    expect(isScheduledOn(firstAndFifteenth, '2026-03-01')).toBe(true);
    expect(isScheduledOn(firstAndFifteenth, '2026-03-15')).toBe(true);
    expect(isScheduledOn(firstAndFifteenth, '2026-03-02')).toBe(false);
  });

  it('falls on the last day of a shorter month (31st in April → 30th; 30th in February → 28th or 29th)', () => {
    const endOfMonth: Schedule = { type: 'monthly', daysOfMonth: [31] };
    expect(isScheduledOn(endOfMonth, '2026-04-30')).toBe(true);
    expect(isScheduledOn(endOfMonth, '2026-02-28')).toBe(true);
    expect(isScheduledOn(endOfMonth, '2028-02-28')).toBe(false); // leap year: the 29th is last
    expect(isScheduledOn(endOfMonth, '2028-02-29')).toBe(true);
    expect(isScheduledOn({ type: 'monthly', daysOfMonth: [30] }, '2026-02-28')).toBe(true);
    expect(isScheduledOn(endOfMonth, '2026-03-30')).toBe(false);
    expect(daysInMonth('2026-02-10')).toBe(28);
  });

  it('due today, adherence and streak count scheduled days only', () => {
    const a = routine(firstAndFifteenth);
    expect(isDueToday(a, [], '2026-03-15')).toBe(true);
    expect(isDueToday(a, [], '2026-03-16')).toBe(false);
    // Window ending 2026-03-20 (28 days): scheduled 2026-03-01 and 2026-03-15; one kept.
    expect(routineAdherence(a, ['2026-03-15'], '2026-03-20')).toBe(0.5);
    // Kept 1 Feb, 15 Feb, 1 Mar; today (2 Mar) is not a scheduled day.
    expect(routineStreak(a, ['2026-02-01', '2026-02-15', '2026-03-01'], '2026-03-02')).toBe(3);
    expect(routineStreak(a, ['2026-02-01', '2026-03-01'], '2026-03-02')).toBe(1);
  });

  it('normalises and validates the days', () => {
    expect(normalizeSchedule({ type: 'monthly', daysOfMonth: [15, 1, 15] })).toEqual({ type: 'monthly', daysOfMonth: [1, 15] });
    expect(() => normalizeSchedule({ type: 'monthly', daysOfMonth: [] })).toThrow();
    expect(() => normalizeSchedule({ type: 'monthly', daysOfMonth: [32] })).toThrow();
    expect(() => normalizeSchedule({ type: 'monthly', daysOfMonth: [1.5] })).toThrow();
  });
});

describe('specific-date schedules', () => {
  const dates: Schedule = { type: 'dates', dates: ['2026-03-05', '2026-03-19'] };

  it('is due on the listed dates only', () => {
    expect(isScheduledOn(dates, '2026-03-05')).toBe(true);
    expect(isScheduledOn(dates, '2026-03-06')).toBe(false);
    expect(isDueToday(routine(dates), [], '2026-03-19')).toBe(true);
    expect(isDueToday(routine(dates, '2026-03-10'), [], '2026-03-05')).toBe(false); // before the start
  });

  it('adherence is "not measurable" when no listed date is in the window yet', () => {
    expect(routineAdherence(routine(dates), [], '2026-03-04')).toBeNull();
    expect(routineAdherence(routine(dates), ['2026-03-05'], '2026-03-20')).toBe(0.5);
    expect(routineStreak(routine(dates), ['2026-03-05', '2026-03-19'], '2026-03-25')).toBe(2);
  });

  it('normalises and validates the dates', () => {
    expect(normalizeSchedule({ type: 'dates', dates: ['2026-03-19', '2026-03-05', '2026-03-19'] })).toEqual({
      type: 'dates',
      dates: ['2026-03-05', '2026-03-19'],
    });
    expect(() => normalizeSchedule({ type: 'dates', dates: [] })).toThrow();
    expect(() => normalizeSchedule({ type: 'dates', dates: ['2026-02-30'] })).toThrow();
    const many = Array.from({ length: 61 }, (_, i) => `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, '0')}`);
    expect(() => normalizeSchedule({ type: 'dates', dates: many })).toThrow();
  });
});

describe('existing schedules are unchanged', () => {
  it('weekly has no named days', () => {
    expect(isScheduledOn({ type: 'weekly', timesPerWeek: 3 }, '2026-03-05')).toBeNull();
    expect(isScheduledOn({ type: 'daily' }, '2026-03-05')).toBe(true);
    expect(isScheduledOn({ type: 'weekdays', days: [4] }, '2026-03-05')).toBe(true); // a Thursday
  });
});
