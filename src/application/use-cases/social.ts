import { z } from 'zod';
import { guard } from '../errors';
import type { Deps } from '../ports';
import type { Ctx, Result } from '../result';
import {
  addPostCommentSchema,
  createSocialPostSchema,
  setGoalVisibilitySchema,
  updateSocialPostSchema,
  updateSocialProfileSchema,
  type DiscoverResultDTO,
  type FollowConnectionDTO,
  type GoalVisibility,
  type SocialCommentDTO,
  type SocialFeedDTO,
  type SocialNotificationsListDTO,
  type SocialPostDTO,
  type SocialProfileDTO,
} from '../social';

const targetUserIdSchema = z.object({ targetUserId: z.uuid({ message: 'Invalid user id' }) });
const postIdSchema = z.object({ postId: z.uuid({ message: 'Invalid post id' }) });
const commentIdSchema = z.object({ commentId: z.uuid({ message: 'Invalid comment id' }) });

export async function getSocialProfile(
  deps: Deps,
  ctx: Ctx,
  input: { userId?: string; username?: string; viewAsPublic?: boolean } = {},
): Promise<Result<SocialProfileDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => repos.social.callRpc<SocialProfileDTO>('get_social_profile', input)),
  );
}

export async function updateSocialProfile(
  deps: Deps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<SocialProfileDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => {
      const data = updateSocialProfileSchema.parse(input);
      return repos.social.callRpc<SocialProfileDTO>('update_social_profile', data);
    }),
  );
}

export async function setGoalVisibility(
  deps: Deps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<{ goalId: string; visibility: GoalVisibility }>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => {
      const data = setGoalVisibilitySchema.parse(input);
      return repos.social.callRpc<{ goalId: string; visibility: GoalVisibility }>('set_goal_visibility', data);
    }),
  );
}

export async function getGoalVisibility(
  deps: Deps,
  ctx: Ctx,
  input: { goalId: string },
): Promise<Result<{ goalId: string; visibility: GoalVisibility }>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => {
      const parsed = z.object({ goalId: z.uuid({ message: 'Invalid goal id' }) }).parse(input);
      return repos.social.callRpc<{ goalId: string; visibility: GoalVisibility }>('get_goal_visibility', parsed);
    }),
  );
}

export async function followUser(
  deps: Deps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<{ following: boolean; followersCount: number; followingCount: number }>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => {
      const data = targetUserIdSchema.parse(input);
      return repos.social.callRpc('follow_user', data);
    }),
  );
}

export async function unfollowUser(
  deps: Deps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<{ following: boolean; followersCount: number; followingCount: number }>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => {
      const data = targetUserIdSchema.parse(input);
      return repos.social.callRpc('unfollow_user', data);
    }),
  );
}

export async function blockUser(
  deps: Deps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<{ blocked: boolean; targetUserId: string }>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => {
      const data = targetUserIdSchema.parse(input);
      return repos.social.callRpc('block_user', data);
    }),
  );
}

export async function unblockUser(
  deps: Deps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<{ blocked: boolean; targetUserId: string }>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => {
      const data = targetUserIdSchema.parse(input);
      return repos.social.callRpc('unblock_user', data);
    }),
  );
}

export async function listFollowConnections(
  deps: Deps,
  ctx: Ctx,
  input: { kind: 'followers' | 'following'; userId?: string; username?: string; limit?: number },
): Promise<Result<{ items: FollowConnectionDTO[] }>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => repos.social.callRpc('list_follow_connections', input)),
  );
}

export async function discoverUsers(
  deps: Deps,
  ctx: Ctx,
  input: { query?: string; limit?: number } = {},
): Promise<Result<DiscoverResultDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => repos.social.callRpc<DiscoverResultDTO>('discover_users', input)),
  );
}

export async function createSocialPost(
  deps: Deps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<SocialPostDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => {
      const data = createSocialPostSchema.parse(input);
      const payload: Record<string, unknown> = {
        type: data.type,
        visibility: data.visibility,
      };
      if (data.id) payload.id = data.id;
      if (data.goalId) payload.goalId = data.goalId;
      if (data.headline !== undefined) payload.headline = data.headline;
      if (data.body !== undefined) payload.body = data.body;
      if (data.imageUrl) payload.imageUrl = data.imageUrl;
      if (data.includeStats !== undefined) payload.includeStats = data.includeStats;
      if (data.makeGoalPublic !== undefined) payload.makeGoalPublic = data.makeGoalPublic;
      return repos.social.callRpc<SocialPostDTO>('create_social_post', payload);
    }),
  );
}

export async function updateSocialPost(
  deps: Deps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<SocialPostDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => {
      const data = updateSocialPostSchema.parse(input);
      return repos.social.callRpc<SocialPostDTO>('update_social_post', data);
    }),
  );
}

export async function deleteSocialPost(
  deps: Deps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<{ deleted: boolean; postId: string }>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => {
      const data = postIdSchema.parse(input);
      return repos.social.callRpc('delete_social_post', data);
    }),
  );
}

export async function getSocialFeed(
  deps: Deps,
  ctx: Ctx,
  input: {
    scope?: 'following' | 'explore' | 'profile';
    userId?: string;
    username?: string;
    viewAsPublic?: boolean;
    limit?: number;
    before?: string;
    beforeId?: string;
  } = {},
): Promise<Result<SocialFeedDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => repos.social.callRpc<SocialFeedDTO>('get_social_feed', input)),
  );
}

export async function getSocialPost(
  deps: Deps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<SocialPostDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => {
      const data = postIdSchema.parse(input);
      return repos.social.callRpc<SocialPostDTO>('get_social_post', data);
    }),
  );
}

/** The photo of one post the caller may see, as a JPEG data URI (NOT_FOUND otherwise). */
export async function getPostImage(
  deps: Deps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<{ postId: string; image: string }>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => {
      const data = postIdSchema.parse(input);
      return repos.social.callRpc<{ postId: string; image: string }>('get_post_image', data);
    }),
  );
}

export async function togglePostLike(
  deps: Deps,
  ctx: Ctx,
  input: { postId: string; like?: boolean },
): Promise<Result<{ postId: string; liked: boolean; likeCount: number }>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => {
      const data = z.object({ postId: z.uuid({ message: 'Invalid post id' }), like: z.boolean().optional() }).parse(input);
      return repos.social.callRpc('toggle_post_like', data);
    }),
  );
}

export async function addPostComment(
  deps: Deps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<{ comment: SocialCommentDTO; commentCount: number }>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => {
      const data = addPostCommentSchema.parse(input);
      return repos.social.callRpc('add_post_comment', data);
    }),
  );
}

export async function deletePostComment(
  deps: Deps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<{ deleted: boolean; commentId: string; postId: string; commentCount: number }>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => {
      const data = commentIdSchema.parse(input);
      return repos.social.callRpc('delete_post_comment', data);
    }),
  );
}

export async function hideOrReportPost(
  deps: Deps,
  ctx: Ctx,
  input: { postId: string; action: 'hide' | 'report'; reason?: string },
): Promise<Result<{ hidden: boolean; reported: boolean; postId: string }>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => {
      const data = z
        .object({
          postId: z.uuid({ message: 'Invalid post id' }),
          action: z.enum(['hide', 'report']),
          reason: z.string().trim().max(500).optional(),
        })
        .parse(input);
      return repos.social.callRpc('hide_or_report_post', data);
    }),
  );
}

export async function listSocialNotifications(
  deps: Deps,
  ctx: Ctx,
  input: { limit?: number } = {},
): Promise<Result<SocialNotificationsListDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) =>
      repos.social.callRpc<SocialNotificationsListDTO>('list_social_notifications', input),
    ),
  );
}

export async function markNotificationsRead(
  deps: Deps,
  ctx: Ctx,
  input: { notificationId?: string } = {},
): Promise<Result<{ unreadCount: number }>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, (repos) => repos.social.callRpc('mark_notifications_read', input)),
  );
}
