import { z } from 'zod';

// ---------- Shared Social DTOs ----------

export type GoalVisibility = 'private' | 'public';
export type PostVisibility = 'public' | 'private';
export type SocialPostType =
  | 'goal_completed'
  | 'milestone'
  | 'progress_update'
  | 'general_achievement'
  | 'goal_started';

export type SocialNotificationKind =
  | 'new_follower'
  | 'post_liked'
  | 'post_commented'
  | 'followed_milestone';

export interface SocialAuthorDTO {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface SocialPostStatsDTO {
  tasksDone?: number;
  tasksTotal?: number;
  keyAreas?: number;
  actionsPlanned?: number;
  routineCount?: number;
}

export interface SocialPostGoalDTO {
  id: string;
  title: string;
  status: string;
  achievedAt: string | null;
  visibility: GoalVisibility;
}

export interface SocialCommentDTO {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  canDelete: boolean;
  author: SocialAuthorDTO;
}

export interface SocialPostDTO {
  id: string;
  type: SocialPostType;
  visibility: PostVisibility;
  headline: string;
  body: string;
  imageUrl: string | null;
  stats: SocialPostStatsDTO | null;
  goal: SocialPostGoalDTO | null;
  createdAt: string;
  updatedAt: string;
  isOwnPost: boolean;
  author: SocialAuthorDTO;
  likeCount: number;
  commentCount: number;
  likedByViewer: boolean;
  recentComments: SocialCommentDTO[];
  comments?: SocialCommentDTO[];
}

export interface PublicGoalSummaryDTO {
  id: string;
  title: string;
  status: string;
  targetDate: string | null;
  activatedOn: string | null;
  achievedAt: string | null;
  outcomeCount: number;
  actionCount: number;
  completedTasks: number;
  totalTasks: number;
}

export interface OwnGoalVisibilityDTO {
  id: string;
  title: string;
  status: string;
  visibility: GoalVisibility;
  achievedAt: string | null;
  completedTasks: number;
  totalTasks: number;
}

export interface SocialProfileStatsDTO {
  goalsCompleted: number;
  activePublicGoals: number;
  tasksCompleted: number;
  postsCount: number;
}

export interface SocialProfileDTO {
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  location: string;
  website: string;
  avatarUrl: string | null;
  isPrivate: boolean;
  restricted: boolean;
  joinedAt: string;
  isOwnProfile: boolean;
  isFollowing: boolean;
  followsViewer: boolean;
  followersCount: number;
  followingCount: number;
  stats: SocialProfileStatsDTO | null;
  publicGoals: PublicGoalSummaryDTO[];
  ownGoals: OwnGoalVisibilityDTO[];
  recentPosts: SocialPostDTO[];
}

export interface FollowConnectionDTO {
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  isPrivate: boolean;
  isOwnProfile: boolean;
  isFollowing: boolean;
}

export interface DiscoverUserDTO {
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  isOwnProfile: boolean;
  isFollowing: boolean;
  followersCount: number;
  publicGoalTitle: string | null;
  reason: string;
}

export interface DiscoverResultDTO {
  users: DiscoverUserDTO[];
  recentAchievements: SocialPostDTO[];
}

export interface SocialFeedCursorDTO {
  before: string;
  beforeId: string;
}

export interface SocialFeedDTO {
  items: SocialPostDTO[];
  nextCursor: SocialFeedCursorDTO | null;
  followingCount: number;
}

export interface SocialNotificationDTO {
  id: string;
  kind: SocialNotificationKind;
  postId: string | null;
  commentId: string | null;
  readAt: string | null;
  createdAt: string;
  actor: SocialAuthorDTO;
  postHeadline: string | null;
}

export interface SocialNotificationsListDTO {
  items: SocialNotificationDTO[];
  unreadCount: number;
}

// ---------- Validation Schemas ----------

const uuid = z.uuid({ message: 'Invalid id' });

export const RESERVED_USERNAMES = new Set([
  'admin',
  'settings',
  'today',
  'goal',
  'matrix',
  'review',
  'community',
  'signin',
  'signup',
  'pricing',
  'challenge',
  'api',
  'account',
  'share',
  's',
  'u',
  'new',
  'edit',
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Use at least 3 characters')
  .max(30, 'Keep it under 30 characters')
  .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers, or underscores')
  .refine((u) => !RESERVED_USERNAMES.has(u), 'That username is reserved');

const imageDataOrHttps = (maxChars: number, label: string) =>
  z
    .string()
    .trim()
    .max(maxChars, `${label} is too large`)
    .refine(
      (v) =>
        v === '' ||
        /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ||
        (v.length <= 500 && /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}\/[^\s<>"]+$/.test(v)),
      'Use a PNG, JPEG, or WebP image',
    );

export const updateSocialProfileSchema = z.object({
  displayName: z.string().trim().min(1, 'Required').max(80, 'Keep it under 80 characters').optional(),
  username: usernameSchema.optional(),
  bio: z.string().trim().max(280, 'Keep it under 280 characters').optional(),
  location: z.string().trim().max(80, 'Keep it under 80 characters').optional(),
  website: z
    .string()
    .trim()
    .max(200, 'Keep it under 200 characters')
    .refine(
      (v) => v === '' || /^https?:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(\/.*)?$/.test(v),
      'Enter a valid http:// or https:// website URL',
    )
    .optional(),
  avatarUrl: imageDataOrHttps(350_000, 'Profile picture').nullable().optional(),
  isPrivate: z.boolean().optional(),
});

export const setGoalVisibilitySchema = z.object({
  goalId: uuid,
  visibility: z.enum(['private', 'public']),
});

export const createSocialPostSchema = z.object({
  id: uuid.optional(),
  type: z.enum(['goal_completed', 'milestone', 'progress_update', 'general_achievement', 'goal_started']),
  goalId: uuid.nullable().optional(),
  visibility: z.enum(['public', 'private']).default('public'),
  headline: z.string().trim().max(160, 'Keep it under 160 characters').optional(),
  body: z.string().trim().max(2000, 'Keep it under 2000 characters').optional(),
  imageUrl: imageDataOrHttps(450_000, 'Image').nullable().optional(),
  includeStats: z.boolean().optional(),
  makeGoalPublic: z.boolean().optional(),
});

export const updateSocialPostSchema = z.object({
  postId: uuid,
  headline: z.string().trim().max(160, 'Keep it under 160 characters').optional(),
  body: z.string().trim().max(2000, 'Keep it under 2000 characters').optional(),
  visibility: z.enum(['public', 'private']).optional(),
});

export const addPostCommentSchema = z.object({
  postId: uuid,
  body: z.string().trim().min(1, 'Write a comment before posting').max(500, 'Keep comments under 500 characters'),
});

export const POST_TYPE_LABELS: Record<SocialPostType, string> = {
  goal_completed: 'Goal completed',
  milestone: 'Milestone achieved',
  progress_update: 'Progress update',
  general_achievement: 'Personal achievement',
  goal_started: 'New goal started',
};
