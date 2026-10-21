import type { Schedule } from '@shared/domain/types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export { DAY_NAMES };

export function formatShortDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function relativeDay(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return 'today';
  const diff = Math.round(
    (new Date(`${dateStr}T00:00:00`).getTime() - new Date(`${todayStr}T00:00:00`).getTime()) / 86_400_000,
  );
  if (diff === 1) return 'tomorrow';
  if (diff > 1 && diff <= 7) return `in ${diff} days`;
  return formatShortDate(dateStr);
}

export function describeSchedule(schedule: Schedule | null | undefined): string {
  if (!schedule) return '';
  if (schedule.type === 'daily') return 'Every day';
  if (schedule.type === 'weekdays') return schedule.days.map((d) => DAY_NAMES[d]).join(' · ');
  if (schedule.type === 'weekly') return `${schedule.timesPerWeek}× a week`;
  return '';
}
