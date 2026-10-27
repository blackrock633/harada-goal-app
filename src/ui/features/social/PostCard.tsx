'use client';

import * as React from 'react';
import Link from 'next/link';
import { Heart, MessageSquare, Trophy, Flag, Sparkles, Lock, Globe, Trash2, EyeOff, ShieldAlert, Pencil } from 'lucide-react';
import type { Result } from '@/application/result';
import {
  POST_TYPE_LABELS,
  type SocialCommentDTO,
  type SocialPostDTO,
  type PostVisibility,
} from '@/application/social';
import { Button } from '@/ui/primitives';
import { routes } from '@/ui/routes';
import { Avatar } from './Avatar';

export interface PostCardActions {
  toggleLike: (input: { postId: string; like?: boolean }) => Promise<Result<{ postId: string; liked: boolean; likeCount: number }>>;
  addComment: (input: { postId: string; body: string }) => Promise<Result<{ comment: SocialCommentDTO; commentCount: number }>>;
  deleteComment: (input: { commentId: string }) => Promise<Result<{ deleted: boolean; commentId: string; postId: string; commentCount: number }>>;
  loadPostDetail?: (input: { postId: string }) => Promise<Result<SocialPostDTO>>;
  updatePost?: (input: { postId: string; headline?: string; body?: string; visibility?: PostVisibility }) => Promise<Result<SocialPostDTO>>;
  deletePost?: (input: { postId: string }) => Promise<Result<{ deleted: boolean; postId: string }>>;
  hideOrReportPost?: (input: { postId: string; action: 'hide' | 'report'; reason?: string }) => Promise<Result<{ hidden: boolean; reported: boolean; postId: string }>>;
}

export interface PostCardProps {
  post: SocialPostDTO;
  actions: PostCardActions;
  onPostDeleted?: (postId: string) => void;
  onPostUpdated?: (post: SocialPostDTO) => void;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function PostCard({ post: initialPost, actions, onPostDeleted, onPostUpdated }: PostCardProps) {
  const [post, setPost] = React.useState<SocialPostDTO>(initialPost);
  const [comments, setComments] = React.useState<SocialCommentDTO[]>(
    initialPost.comments ?? initialPost.recentComments ?? [],
  );
  const [commentsOpen, setCommentsOpen] = React.useState(false);
  const [allCommentsLoaded, setAllCommentsLoaded] = React.useState(Boolean(initialPost.comments));
  const [commentBody, setCommentBody] = React.useState('');
  const [commentBusy, setCommentBusy] = React.useState(false);
  const [likeBusy, setLikeBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editHeadline, setEditHeadline] = React.useState(initialPost.headline);
  const [editBody, setEditBody] = React.useState(initialPost.body);
  const [editVis, setEditVis] = React.useState<PostVisibility>(initialPost.visibility);
  const [editBusy, setEditBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPost(initialPost);
    setComments(initialPost.comments ?? initialPost.recentComments ?? []);
  }, [initialPost]);

  async function handleToggleLike() {
    if (likeBusy) return;
    setLikeBusy(true);
    setError(null);
    const nextLiked = !post.likedByViewer;
    const prevLiked = post.likedByViewer;
    const prevCount = post.likeCount;
    // Optimistic update with rollback on error
    setPost((p) => ({
      ...p,
      likedByViewer: nextLiked,
      likeCount: Math.max(0, p.likeCount + (nextLiked ? 1 : -1)),
    }));
    try {
      const res = await actions.toggleLike({ postId: post.id, like: nextLiked });
      if (res.ok) {
        setPost((p) => ({ ...p, likedByViewer: res.data.liked, likeCount: res.data.likeCount }));
      } else {
        setPost((p) => ({ ...p, likedByViewer: prevLiked, likeCount: prevCount }));
        setError(res.error.message);
      }
    } catch {
      setPost((p) => ({ ...p, likedByViewer: prevLiked, likeCount: prevCount }));
      setError("Couldn't update like. Please try again.");
    } finally {
      setLikeBusy(false);
    }
  }

  async function handleExpandComments() {
    const nextOpen = !commentsOpen;
    setCommentsOpen(nextOpen);
    if (nextOpen && !allCommentsLoaded && actions.loadPostDetail && post.commentCount > comments.length) {
      const res = await actions.loadPostDetail({ postId: post.id });
      if (res.ok && res.data.comments) {
        setComments(res.data.comments);
        setAllCommentsLoaded(true);
      }
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (commentBusy) return;
    const trimmed = commentBody.trim();
    if (!trimmed) {
      setError('Write a comment before posting.');
      return;
    }
    setCommentBusy(true);
    setError(null);
    try {
      const res = await actions.addComment({ postId: post.id, body: trimmed });
      if (res.ok) {
        setCommentBody('');
        setComments((prev) => [...prev, res.data.comment]);
        setPost((p) => ({ ...p, commentCount: res.data.commentCount }));
      } else {
        setError(res.error.message);
      }
    } catch {
      setError("Couldn't post comment. Please try again.");
    } finally {
      setCommentBusy(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    setError(null);
    const res = await actions.deleteComment({ commentId });
    if (res.ok) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setPost((p) => ({ ...p, commentCount: res.data.commentCount }));
    } else {
      setError(res.error.message);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!actions.updatePost || editBusy) return;
    setEditBusy(true);
    setError(null);
    try {
      const res = await actions.updatePost({
        postId: post.id,
        headline: editHeadline,
        body: editBody,
        visibility: editVis,
      });
      if (res.ok) {
        setPost(res.data);
        setEditing(false);
        onPostUpdated?.(res.data);
      } else {
        setError(res.error.message);
      }
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDeletePost() {
    if (!actions.deletePost) return;
    setError(null);
    const res = await actions.deletePost({ postId: post.id });
    if (res.ok) {
      onPostDeleted?.(post.id);
    } else {
      setError(res.error.message);
    }
  }

  async function handleHideOrReport(action: 'hide' | 'report') {
    if (!actions.hideOrReportPost) return;
    const res = await actions.hideOrReportPost({
      postId: post.id,
      action,
      reason: action === 'report' ? 'Reported from community feed' : undefined,
    });
    if (res.ok) {
      onPostDeleted?.(post.id);
    } else {
      setError(res.error.message);
    }
  }

  const isCelebration = post.type === 'goal_completed' || post.type === 'milestone';

  return (
    <article
      data-testid={`social-post-${post.id}`}
      className="space-y-4 rounded-[var(--radius-md)] border border-rule bg-surface p-5"
    >
      {/* Author header */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={routes.profile(post.author.username)} className="shrink-0">
            <Avatar
              displayName={post.author.displayName}
              username={post.author.username}
              avatarUrl={post.author.avatarUrl}
              size="md"
            />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <Link
                href={routes.profile(post.author.username)}
                className="truncate font-medium text-ink hover:underline"
              >
                {post.author.displayName}
              </Link>
              <Link
                href={routes.profile(post.author.username)}
                className="truncate text-sm text-ink-muted hover:underline"
              >
                @{post.author.username}
              </Link>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <time dateTime={post.createdAt}>{formatTimestamp(post.createdAt)}</time>
              <span>·</span>
              <span className="inline-flex items-center gap-1 font-medium text-ink">
                {post.type === 'goal_completed' ? (
                  <Trophy className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                ) : post.type === 'milestone' ? (
                  <Flag className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                )}
                {POST_TYPE_LABELS[post.type]}
              </span>
              {post.visibility === 'private' && (
                <span className="inline-flex items-center gap-1 rounded bg-surface-sunken px-1.5 py-0.5 text-xs text-ink-muted">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  Private
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Post owner or viewer moderation actions */}
        <div className="flex shrink-0 items-center gap-1">
          {post.isOwnPost && actions.updatePost && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              aria-label="Edit post"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] text-ink-muted hover:bg-surface-sunken hover:text-ink"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {post.isOwnPost && actions.deletePost && (
            <button
              type="button"
              onClick={() => void handleDeletePost()}
              aria-label="Delete post"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] text-ink-muted hover:bg-surface-sunken hover:text-danger"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {!post.isOwnPost && actions.hideOrReportPost && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void handleHideOrReport('hide')}
                aria-label="Hide post"
                title="Hide from feed"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] text-ink-muted hover:bg-surface-sunken hover:text-ink"
              >
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => void handleHideOrReport('report')}
                aria-label="Report post"
                title="Report inappropriate content"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] text-ink-muted hover:bg-surface-sunken hover:text-danger"
              >
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Edit post inline form */}
      {editing ? (
        <form onSubmit={(e) => void handleSaveEdit(e)} className="space-y-3 border-t border-rule pt-3">
          <div>
            <label htmlFor={`edit-headline-${post.id}`} className="block text-xs font-medium text-ink-muted">
              Headline
            </label>
            <input
              id={`edit-headline-${post.id}`}
              type="text"
              maxLength={160}
              value={editHeadline}
              onChange={(e) => setEditHeadline(e.target.value)}
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-sm text-ink"
            />
          </div>
          <div>
            <label htmlFor={`edit-body-${post.id}`} className="block text-xs font-medium text-ink-muted">
              Update
            </label>
            <textarea
              id={`edit-body-${post.id}`}
              rows={3}
              maxLength={2000}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-sm text-ink"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <select
              aria-label="Post visibility"
              value={editVis}
              onChange={(e) => setEditVis(e.target.value as PostVisibility)}
              className="rounded-[var(--radius-sm)] border border-rule bg-paper px-2.5 py-1.5 text-sm text-ink"
            >
              <option value="public">Public</option>
              <option value="private">Private (only me)</option>
            </select>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={editBusy}>
                Save changes
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <>
          {/* Linked Goal Pill */}
          {post.goal && (
            <div
              className={
                isCelebration
                  ? 'rounded-[var(--radius-sm)] border border-accent/30 bg-accent-soft/50 px-3.5 py-2.5'
                  : 'rounded-[var(--radius-sm)] bg-surface-sunken px-3.5 py-2'
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                    {post.type === 'goal_completed' ? 'Goal Achieved' : 'Goal'}
                  </span>
                  {post.isOwnPost ? (
                    <Link
                      href={routes.goal(post.goal.id)}
                      className="font-serif text-base font-medium text-ink hover:underline"
                    >
                      {post.goal.title}
                    </Link>
                  ) : (
                    <Link
                      href={routes.profile(post.author.username)}
                      className="font-serif text-base font-medium text-ink hover:underline"
                    >
                      {post.goal.title}
                    </Link>
                  )}
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                  {post.goal.visibility === 'public' ? (
                    <>
                      <Globe className="h-3 w-3" aria-hidden="true" /> Public goal
                    </>
                  ) : (
                    <>
                      <Lock className="h-3 w-3" aria-hidden="true" /> Private goal
                    </>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Post Headline & Body */}
          <div className="space-y-2">
            {post.headline && (
              <h3 className="font-serif text-xl leading-snug text-ink break-words">{post.headline}</h3>
            )}
            {post.body && (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{post.body}</p>
            )}
          </div>

          {/* Optional Image */}
          {post.imageUrl && (
            <div className="overflow-hidden rounded-[var(--radius-sm)] border border-rule">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.imageUrl}
                alt={post.headline || 'Shared progress photo'}
                className="max-h-96 w-full object-cover"
              />
            </div>
          )}

          {/* Server-verified Harada stats */}
          {post.stats && (
            <dl
              aria-label="Verified progress statistics"
              className="grid grid-cols-2 gap-3 border-t border-rule pt-3 sm:grid-cols-3"
            >
              {post.stats.tasksTotal !== undefined && (
                <div>
                  <dt className="text-xs text-ink-muted">Tasks completed</dt>
                  <dd className="font-medium tabular-nums text-ink">
                    {post.stats.tasksTotal === 0
                      ? 'No tasks yet'
                      : `${post.stats.tasksDone ?? 0} of ${post.stats.tasksTotal}`}
                  </dd>
                </div>
              )}
              {post.stats.keyAreas !== undefined && (
                <div>
                  <dt className="text-xs text-ink-muted">Key areas planned</dt>
                  <dd className="font-medium tabular-nums text-ink">{post.stats.keyAreas} of 8</dd>
                </div>
              )}
              {post.stats.actionsPlanned !== undefined && (
                <div>
                  <dt className="text-xs text-ink-muted">Matrix actions</dt>
                  <dd className="font-medium tabular-nums text-ink">{post.stats.actionsPlanned} of 64</dd>
                </div>
              )}
            </dl>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      {/* Engagement bar: Likes & Comments */}
      <footer className="space-y-3 border-t border-rule pt-3">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => void handleToggleLike()}
            disabled={likeBusy}
            aria-pressed={post.likedByViewer}
            aria-label={post.likedByViewer ? `Unlike post (${post.likeCount})` : `Like post (${post.likeCount})`}
            className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-sm font-medium transition-colors ${
              post.likedByViewer
                ? 'bg-accent-soft text-accent'
                : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
            }`}
          >
            <Heart
              className="h-4 w-4"
              fill={post.likedByViewer ? 'currentColor' : 'none'}
              aria-hidden="true"
            />
            <span className="tabular-nums">{post.likeCount}</span>
            <span>{post.likeCount === 1 ? 'Like' : 'Likes'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleExpandComments()}
            aria-expanded={commentsOpen}
            aria-label={`Comments (${post.commentCount})`}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-sm font-medium text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            <span className="tabular-nums">{post.commentCount}</span>
            <span>{post.commentCount === 1 ? 'Comment' : 'Comments'}</span>
          </button>
        </div>

        {/* Comments section */}
        {(commentsOpen || comments.length > 0) && (
          <div className="space-y-3 pt-1">
            {post.commentCount > comments.length && !allCommentsLoaded && actions.loadPostDetail && (
              <button
                type="button"
                onClick={() => void handleExpandComments()}
                className="cursor-pointer text-xs font-medium text-accent underline underline-offset-2"
              >
                View all {post.commentCount} comments
              </button>
            )}

            {comments.length > 0 && (
              <ul className="space-y-2.5">
                {comments.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="flex min-w-0 items-start gap-2">
                      <Link href={routes.profile(c.author.username)} className="mt-0.5 shrink-0">
                        <Avatar
                          displayName={c.author.displayName}
                          username={c.author.username}
                          avatarUrl={c.author.avatarUrl}
                          size="sm"
                        />
                      </Link>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <Link
                            href={routes.profile(c.author.username)}
                            className="font-medium text-ink hover:underline"
                          >
                            {c.author.displayName}
                          </Link>
                          <span className="text-xs text-ink-muted">@{c.author.username}</span>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-ink">{c.body}</p>
                      </div>
                    </div>
                    {c.canDelete && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteComment(c.id)}
                        aria-label={`Delete comment by ${c.author.displayName}`}
                        className="shrink-0 cursor-pointer p-1 text-xs text-ink-muted hover:text-danger"
                      >
                        Delete
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {commentsOpen && (
              <form onSubmit={(e) => void handleAddComment(e)} className="flex items-center gap-2 pt-1">
                <label htmlFor={`comment-input-${post.id}`} className="sr-only">
                  Add a comment
                </label>
                <input
                  id={`comment-input-${post.id}`}
                  type="text"
                  maxLength={500}
                  placeholder="Write an encouraging comment…"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-sm text-ink"
                />
                <Button type="submit" variant="secondary" loading={commentBusy}>
                  Post
                </Button>
              </form>
            )}
          </div>
        )}
      </footer>
    </article>
  );
}
