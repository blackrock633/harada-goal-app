'use server';

import * as uc from '@/application/use-cases';
import type { GoalVisibility } from '@/application/social';
import { runAuthed } from './run';

export async function getSocialProfileAction(input: {
  userId?: string;
  username?: string;
  viewAsPublic?: boolean;
} = {}) {
  return runAuthed((deps, ctx) => uc.getSocialProfile(deps, ctx, input));
}

export async function updateSocialProfileAction(input: unknown) {
  return runAuthed((deps, ctx) => uc.updateSocialProfile(deps, ctx, input));
}

export async function setGoalVisibilityAction(input: { goalId: string; visibility: GoalVisibility }) {
  return runAuthed((deps, ctx) => uc.setGoalVisibility(deps, ctx, input));
}

export async function getGoalVisibilityAction(input: { goalId: string }) {
  return runAuthed((deps, ctx) => uc.getGoalVisibility(deps, ctx, input));
}

export async function followUserAction(input: { targetUserId: string }) {
  return runAuthed((deps, ctx) => uc.followUser(deps, ctx, input));
}

export async function unfollowUserAction(input: { targetUserId: string }) {
  return runAuthed((deps, ctx) => uc.unfollowUser(deps, ctx, input));
}

export async function blockUserAction(input: { targetUserId: string }) {
  return runAuthed((deps, ctx) => uc.blockUser(deps, ctx, input));
}

export async function unblockUserAction(input: { targetUserId: string }) {
  return runAuthed((deps, ctx) => uc.unblockUser(deps, ctx, input));
}

export async function listFollowConnectionsAction(input: {
  kind: 'followers' | 'following';
  userId?: string;
  username?: string;
  limit?: number;
}) {
  return runAuthed((deps, ctx) => uc.listFollowConnections(deps, ctx, input));
}

export async function discoverUsersAction(input: { query?: string; limit?: number } = {}) {
  return runAuthed((deps, ctx) => uc.discoverUsers(deps, ctx, input));
}

export async function createSocialPostAction(input: unknown) {
  return runAuthed((deps, ctx) => uc.createSocialPost(deps, ctx, input));
}

export async function updateSocialPostAction(input: unknown) {
  return runAuthed((deps, ctx) => uc.updateSocialPost(deps, ctx, input));
}

export async function deleteSocialPostAction(input: { postId: string }) {
  return runAuthed((deps, ctx) => uc.deleteSocialPost(deps, ctx, input));
}

export async function getSocialFeedAction(input: {
  scope?: 'following' | 'explore' | 'profile';
  userId?: string;
  username?: string;
  viewAsPublic?: boolean;
  limit?: number;
  before?: string;
  beforeId?: string;
} = {}) {
  return runAuthed((deps, ctx) => uc.getSocialFeed(deps, ctx, input));
}

export async function getSocialPostAction(input: { postId: string }) {
  return runAuthed((deps, ctx) => uc.getSocialPost(deps, ctx, input));
}

export async function togglePostLikeAction(input: { postId: string; like?: boolean }) {
  return runAuthed((deps, ctx) => uc.togglePostLike(deps, ctx, input));
}

export async function addPostCommentAction(input: { postId: string; body: string }) {
  return runAuthed((deps, ctx) => uc.addPostComment(deps, ctx, input));
}

export async function deletePostCommentAction(input: { commentId: string }) {
  return runAuthed((deps, ctx) => uc.deletePostComment(deps, ctx, input));
}

export async function hideOrReportPostAction(input: {
  postId: string;
  action: 'hide' | 'report';
  reason?: string;
}) {
  return runAuthed((deps, ctx) => uc.hideOrReportPost(deps, ctx, input));
}

export async function listSocialNotificationsAction(input: { limit?: number } = {}) {
  return runAuthed((deps, ctx) => uc.listSocialNotifications(deps, ctx, input));
}

export async function markNotificationsReadAction(input: { notificationId?: string } = {}) {
  return runAuthed((deps, ctx) => uc.markNotificationsRead(deps, ctx, input));
}
