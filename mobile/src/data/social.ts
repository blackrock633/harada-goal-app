import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Result } from '@shared/application/result';

import { QueryError } from './reads';
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

/**
 * Calls a social function. They take their input as `p_input` (get_post_image: `p`); PostgREST matches
 * arguments by name, so a wrong name is a "function not found" for every call.
 */
async function callSocialRpc<T>(
  fnName: string,
  payload: Record<string, unknown> = {},
  argName: 'p_input' | 'p' = 'p_input',
): Promise<Result<T>> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb.rpc(fnName, { [argName]: payload });
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

export function getSocialPost(postId: string, olderThan?: { before: string; beforeId: string }) {
  return callSocialRpc<SocialPostDTO>('get_social_post', {
    postId,
    ...(olderThan ? { commentsBefore: olderThan.before, commentsBeforeId: olderThan.beforeId } : {}),
  });
}

export function deleteSocialPost(postId: string) {
  return callSocialRpc<{ deleted: boolean }>('delete_social_post', { postId });
}

export function hideOrReportPost(postId: string, action: 'hide' | 'report', reason?: string) {
  return callSocialRpc<{ ok: boolean }>('hide_or_report_post', { postId, action, ...(reason ? { reason } : {}) });
}

/** One post's photo, only if the viewer may see the post (the server applies the post's visibility). */
export function getPostImage(postId: string) {
  return callSocialRpc<{ postId: string; image: string }>('get_post_image', { postId }, 'p');
}

// ---------------------------------------------------------------------------------------------------------
// Queries (TanStack). Errors surface as QueryError with the AppError, like every other read.
// ---------------------------------------------------------------------------------------------------------

async function must<T>(p: Promise<Result<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new QueryError(r.error);
  return r.data;
}

export const socialKeys = {
  all: ['social'] as const,
  feed: (scope: 'following' | 'explore') => ['social', 'feed', scope] as const,
  profile: (who: string) => ['social', 'profile', who] as const,
  userPosts: (username: string) => ['social', 'posts', username] as const,
  post: (id: string) => ['social', 'post', id] as const,
  image: (id: string) => ['social', 'image', id] as const,
  people: (q: string) => ['social', 'people', q] as const,
  notifications: ['social', 'notifications'] as const,
  connections: (kind: string, username: string) => ['social', 'connections', kind, username] as const,
};

const PAGE = 15;

/** Chronological feed, one page at a time (cursor = last item's time and id). */
export function useFeed(scope: 'following' | 'explore') {
  return useInfiniteQuery({
    queryKey: socialKeys.feed(scope),
    queryFn: ({ pageParam }) => must(fetchSocialFeed({ scope, limit: PAGE, ...(pageParam ?? {}) })),
    initialPageParam: null as SocialFeedDTO['nextCursor'],
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** A user's own posts, newest first, paginated. */
export function useUserPosts(username: string | undefined) {
  return useInfiniteQuery({
    queryKey: socialKeys.userPosts(username ?? ''),
    queryFn: ({ pageParam }) => must(fetchSocialFeed({ scope: 'profile', username, limit: PAGE, ...(pageParam ?? {}) })),
    initialPageParam: null as SocialFeedDTO['nextCursor'],
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!username,
  });
}

/** `who` is a username, or 'me' for the signed-in user. */
export function useSocialProfile(who: string | undefined) {
  return useQuery({
    queryKey: socialKeys.profile(who ?? ''),
    queryFn: () => must(fetchSocialProfile(who === 'me' ? {} : { username: who })),
    enabled: !!who,
  });
}

export function usePost(id: string | undefined) {
  return useQuery({ queryKey: socialKeys.post(id ?? ''), queryFn: () => must(getSocialPost(id!)), enabled: !!id });
}

/** Loaded when the card is shown; cached for the session (photos never change). */
export function usePostImage(id: string, enabled: boolean) {
  return useQuery({
    queryKey: socialKeys.image(id),
    queryFn: async () => (await must(getPostImage(id))).image,
    enabled,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });
}

export function usePeople(query: string) {
  return useQuery({ queryKey: socialKeys.people(query), queryFn: () => must(discoverUsers(query, 25)), placeholderData: keepPreviousData });
}

export function useNotifications() {
  return useQuery({ queryKey: socialKeys.notifications, queryFn: () => must(listSocialNotifications(50)) });
}

export function useConnections(kind: 'followers' | 'following', username: string | undefined) {
  return useQuery({
    queryKey: socialKeys.connections(kind, username ?? ''),
    queryFn: async () => (await must(listFollowConnections({ kind, username }))).items,
    enabled: !!username,
  });
}

/** After a follow, post, like, comment or profile change: refresh what shows social data. */
export function useInvalidateSocial() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: socialKeys.all });
}
