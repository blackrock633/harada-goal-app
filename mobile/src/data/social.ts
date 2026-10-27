import type { Result } from '@shared/application/result';
import type {
  DiscoverResultDTO,
  FollowConnectionDTO,
  GoalVisibility,
  PostVisibility,
  SocialCommentDTO,
  SocialFeedDTO,
  SocialNotificationsListDTO,
  SocialPostDTO,
  SocialPostType,
  SocialProfileDTO,
} from '@shared/application/social';

import { thrownToAppError, toAppError } from './rpc-errors';
import { getSupabase } from './supabase';

async function callSocialRpc<T>(
  fnName: string,
  payload: Record<string, unknown> = {},
): Promise<Result<T>> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb.rpc(fnName, { p: payload });
    if (error) return { ok: false, error: toAppError(error) };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: thrownToAppError() };
  }
}

export function fetchSocialProfile(input: {
  userId?: string;
  username?: string;
  viewAsPublic?: boolean;
} = {}): Promise<Result<SocialProfileDTO>> {
  return callSocialRpc<SocialProfileDTO>('get_social_profile', input);
}

export function updateSocialProfile(input: {
  displayName?: string;
  username?: string;
  bio?: string;
  location?: string;
  website?: string;
  avatarUrl?: string | null;
  isPrivate?: boolean;
}): Promise<Result<SocialProfileDTO>> {
  return callSocialRpc<SocialProfileDTO>('update_social_profile', input);
}

export function setGoalVisibility(input: {
  goalId: string;
  visibility: GoalVisibility;
}): Promise<Result<{ goalId: string; visibility: GoalVisibility }>> {
  return callSocialRpc('set_goal_visibility', input);
}

export function followUser(targetUserId: string) {
  return callSocialRpc<{ following: boolean; followersCount: number; followingCount: number }>(
    'follow_user',
    { targetUserId },
  );
}

export function unfollowUser(targetUserId: string) {
  return callSocialRpc<{ following: boolean; followersCount: number; followingCount: number }>(
    'unfollow_user',
    { targetUserId },
  );
}

export function blockUser(targetUserId: string) {
  return callSocialRpc<{ blocked: boolean; targetUserId: string }>('block_user', {
    targetUserId,
  });
}

export function listFollowConnections(input: {
  kind: 'followers' | 'following';
  userId?: string;
  username?: string;
}) {
  return callSocialRpc<{ items: FollowConnectionDTO[] }>('list_follow_connections', input);
}

export function discoverUsers(query = '', limit = 20): Promise<Result<DiscoverResultDTO>> {
  return callSocialRpc<DiscoverResultDTO>('discover_users', { query, limit });
}

export function fetchSocialFeed(input: {
  scope?: 'following' | 'explore' | 'profile';
  userId?: string;
  username?: string;
  limit?: number;
  before?: string;
  beforeId?: string;
} = {}): Promise<Result<SocialFeedDTO>> {
  return callSocialRpc<SocialFeedDTO>('get_social_feed', input);
}

export function createSocialPost(input: {
  type: SocialPostType;
  goalId?: string | null;
  visibility: PostVisibility;
  headline?: string;
  body?: string;
  imageUrl?: string | null;
  includeStats?: boolean;
  makeGoalPublic?: boolean;
}): Promise<Result<SocialPostDTO>> {
  return callSocialRpc<SocialPostDTO>('create_social_post', input);
}

export function togglePostLike(postId: string, like?: boolean) {
  return callSocialRpc<{ postId: string; liked: boolean; likeCount: number }>('toggle_post_like', {
    postId,
    like,
  });
}

export function addPostComment(postId: string, body: string) {
  return callSocialRpc<{ comment: SocialCommentDTO; commentCount: number }>('add_post_comment', {
    postId,
    body,
  });
}

export function deletePostComment(commentId: string) {
  return callSocialRpc<{
    deleted: boolean;
    commentId: string;
    postId: string;
    commentCount: number;
  }>('delete_post_comment', { commentId });
}

export function listSocialNotifications(limit = 30): Promise<Result<SocialNotificationsListDTO>> {
  return callSocialRpc<SocialNotificationsListDTO>('list_social_notifications', { limit });
}

export function markNotificationsRead(notificationId?: string) {
  return callSocialRpc<{ unreadCount: number }>('mark_notifications_read', { notificationId });
}
