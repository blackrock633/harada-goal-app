/**
 * Achievement catalogue. The database decides who has what (harada_private.sync_achievements); this file only
 * describes each key for display. Titles must match harada_private.achievement_title() (guarded by a test).
 *
 * Every achievement here is derived from activity recorded in Harada. Self-reported accomplishments are social
 * posts of type `milestone` or `general_achievement`, and are labelled as such wherever they appear.
 */

export const ACHIEVEMENT_KEYS = [
  'founding_member',
  'first_goal_completed',
  'goal_completed',
  'plan_complete',
  'actions_100',
  'actions_500',
  'active_days_30',
  'active_days_90',
  'challenge_completed',
] as const;

export type AchievementKey = (typeof ACHIEVEMENT_KEYS)[number];

export type AchievementCategory = 'founding' | 'goal_milestone' | 'goal_completed' | 'consistency' | 'challenge';

export interface AchievementDefinition {
  title: string;
  category: AchievementCategory;
  /** One sentence stating exactly what earned it. */
  criterion: string;
}

export const ACHIEVEMENTS: Record<AchievementKey, AchievementDefinition> = {
  founding_member: {
    title: 'Founding Member',
    category: 'founding',
    criterion: 'Approved as one of the first 100 members helping build Harada.',
  },
  first_goal_completed: {
    title: 'First Goal Completed',
    category: 'goal_completed',
    criterion: 'Marked a first goal as achieved.',
  },
  goal_completed: {
    title: 'Goal Completed',
    category: 'goal_completed',
    criterion: 'Marked this goal as achieved.',
  },
  plan_complete: {
    title: 'Full Plan Built',
    category: 'goal_milestone',
    criterion: 'Built the complete plan for this goal: 8 key areas and 64 actions.',
  },
  actions_100: {
    title: '100 Actions Completed',
    category: 'consistency',
    criterion: '100 tasks completed or routine check-ins recorded.',
  },
  actions_500: {
    title: '500 Actions Completed',
    category: 'consistency',
    criterion: '500 tasks completed or routine check-ins recorded.',
  },
  active_days_30: {
    title: '30 Days of Progress',
    category: 'consistency',
    criterion: 'Recorded progress on 30 different days.',
  },
  active_days_90: {
    title: '90 Days of Commitment',
    category: 'consistency',
    criterion: 'Recorded progress on 90 different days.',
  },
  challenge_completed: {
    title: '30-Day Challenge Completed',
    category: 'challenge',
    criterion: 'Completed the 30-Day Challenge.',
  },
};

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  founding: 'Founding',
  goal_milestone: 'Goal milestone',
  goal_completed: 'Completed goal',
  consistency: 'Consistency',
  challenge: 'Challenge',
};

export function achievementDefinition(key: string): AchievementDefinition | null {
  return (ACHIEVEMENTS as Record<string, AchievementDefinition>)[key] ?? null;
}

/** "No. 0042": the credential form of a founding number. */
export function formatMemberNumber(n: number): string {
  return `No. ${String(n).padStart(4, '0')}`;
}

/** Post types whose content is the author's own claim rather than recorded activity. */
export function isSelfReportedPostType(type: string): boolean {
  return type === 'milestone' || type === 'general_achievement';
}
