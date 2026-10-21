import type { Schedule } from '@shared/domain/types';

/** Local-date helpers (no Intl dependence beyond toLocaleDateString, which Hermes supports). */
export function formatLocalDate(dateStr: string, style: 'short' | 'medium' | 'long' = 'medium'): string {
  const date = new Date(dateStr + 'T00:00:00'); // enforce local interpretation
  if (isNaN(date.getTime())) return dateStr;
  if (style === 'short') return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (style === 'medium') return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export function relativeDay(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return 'Today';
  const d1 = new Date(dateStr + 'T00:00:00');
  const d2 = new Date(todayStr + 'T00:00:00');
  const diffDays = Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === -1) return 'Yesterday';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1 && diffDays <= 7) return `in ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
  return formatLocalDate(dateStr, 'medium');
}

export function describeSchedule(schedule: Schedule | null | undefined): string {
  if (!schedule) return '';
  if (schedule.type === 'daily') return 'Every day';
  if (schedule.type === 'weekdays') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return schedule.days.map((d) => days[d]).join(' · ');
  }
  if (schedule.type === 'weekly') return `${schedule.timesPerWeek}× a week`;
  return '';
}
