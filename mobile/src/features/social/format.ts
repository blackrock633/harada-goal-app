import type { SocialPostDTO, SocialPostType } from '@shared/application/social';

export const POST_TYPE_LABEL: Record<SocialPostType, string> = {
  goal_completed: 'Achieved a goal',
  milestone: 'Reached a milestone',
  progress_update: 'Progress update',
  general_achievement: 'Achievement',
  goal_started: 'Started a goal',
};

/** "now", "5m", "3h", "2d", then "Oct 3" (and the year when it differs). */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso);
  const s = Math.max(0, Math.round((now.getTime() - t.getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(t.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

/** The verified numbers on a post, as short labelled pairs. Only what the server computed. */
export function statPairs(stats: SocialPostDTO['stats']): { label: string; value: string }[] {
  if (!stats) return [];
  const out: { label: string; value: string }[] = [];
  if (stats.tasksTotal !== undefined) out.push({ label: 'Tasks done', value: `${stats.tasksDone ?? 0}/${stats.tasksTotal}` });
  if (stats.keyAreas !== undefined) out.push({ label: 'Key areas', value: String(stats.keyAreas) });
  if (stats.actionsPlanned !== undefined) out.push({ label: 'Actions', value: String(stats.actionsPlanned) });
  if (stats.routineCount !== undefined) out.push({ label: 'Routines', value: String(stats.routineCount) });
  return out;
}
