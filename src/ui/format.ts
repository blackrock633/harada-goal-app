export function formatPercent(progress: number | null): string {
  if (progress === null) return '—';
  return `${Math.round(progress * 100)}%`;
}

export function formatLocalDate(dateStr: string, style: 'short' | 'medium' | 'long' = 'medium'): string {
  const date = new Date(dateStr + 'T00:00:00'); // enforce local interpretation
  if (isNaN(date.getTime())) return dateStr;
  
  if (style === 'short') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } else if (style === 'medium') {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } else {
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
}

export function relativeDay(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return 'Today';
  
  const d1 = new Date(dateStr + 'T00:00:00');
  const d2 = new Date(todayStr + 'T00:00:00');
  const diffTime = d1.getTime() - d2.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === -1) return 'Yesterday';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1 && diffDays <= 7) return `in ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
  
  return formatLocalDate(dateStr, 'medium');
}

export function describeSchedule(schedule: any): string {
  if (!schedule) return '';
  if (schedule.type === 'daily') return 'Every day';
  if (schedule.type === 'weekdays') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return schedule.days.map((d: number) => days[d]).join(' · ');
  }
  if (schedule.type === 'weekly') {
    return `${schedule.timesPerWeek}× a week`;
  }
  return '';
}

export function paceLabel(pace: 'ahead' | 'on_track' | 'behind' | 'overdue' | 'unknown'): string {
  switch (pace) {
    case 'ahead': return 'Ahead';
    case 'on_track': return 'On track';
    case 'behind': return 'Behind';
    case 'overdue': return 'Overdue';
    case 'unknown': return 'Unknown';
  }
}
