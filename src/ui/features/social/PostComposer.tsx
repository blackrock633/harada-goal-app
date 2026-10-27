'use client';

import * as React from 'react';
import type { Result } from '@/application/result';
import {
  POST_TYPE_LABELS,
  type OwnGoalVisibilityDTO,
  type PostVisibility,
  type SocialPostDTO,
  type SocialPostType,
} from '@/application/social';
import { Button } from '@/ui/primitives';
import { readImageFileAsDataUrl } from './Avatar';

export interface PostComposerProps {
  ownGoals: OwnGoalVisibilityDTO[];
  initialGoalId?: string;
  initialType?: SocialPostType;
  createPost: (input: {
    type: SocialPostType;
    goalId?: string | null;
    visibility: PostVisibility;
    headline?: string;
    body?: string;
    imageUrl?: string | null;
    includeStats?: boolean;
    makeGoalPublic?: boolean;
  }) => Promise<Result<SocialPostDTO>>;
  onCreated?: (post: SocialPostDTO) => void;
  onCancel?: () => void;
}

const TYPES: SocialPostType[] = [
  'progress_update',
  'milestone',
  'goal_completed',
  'general_achievement',
];

export function PostComposer({
  ownGoals,
  initialGoalId,
  initialType = 'progress_update',
  createPost,
  onCreated,
  onCancel,
}: PostComposerProps) {
  const [type, setType] = React.useState<SocialPostType>(initialType);
  const [goalId, setGoalId] = React.useState<string>(initialGoalId ?? '');
  const [headline, setHeadline] = React.useState('');
  const [body, setBody] = React.useState('');
  const [visibility, setVisibility] = React.useState<PostVisibility>('public');
  const [includeStats, setIncludeStats] = React.useState(true);
  const [makeGoalPublic, setMakeGoalPublic] = React.useState(false);
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedGoal = ownGoals.find((g) => g.id === goalId) ?? null;
  const needsGoalPublicConsent =
    Boolean(selectedGoal && selectedGoal.visibility === 'private' && visibility === 'public');

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await readImageFileAsDataUrl(file, 300 * 1024);
      setImageUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid image file.');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (needsGoalPublicConsent && !makeGoalPublic) {
      setError('Check the box to make this goal public on your profile, or set post visibility to Private.');
      return;
    }

    setBusy(true);
    try {
      const res = await createPost({
        type,
        goalId: goalId ? goalId : null,
        visibility,
        headline: headline.trim() || undefined,
        body: body.trim() || undefined,
        imageUrl,
        includeStats: Boolean(goalId && includeStats),
        makeGoalPublic: needsGoalPublicConsent ? makeGoalPublic : undefined,
      });
      if (res.ok) {
        setHeadline('');
        setBody('');
        setImageUrl(null);
        onCreated?.(res.data);
      } else {
        setError(res.error.message);
      }
    } catch {
      setError("Couldn't publish post. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      aria-label="Share progress or achievement"
      className="space-y-4 rounded-[var(--radius-md)] border border-rule bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-medium text-ink">Share progress or a milestone</h2>
        <span className="text-xs text-ink-muted">Nothing is shared automatically</span>
      </div>

      {/* Post type pills */}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Post type">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => setType(t)}
            className={`cursor-pointer rounded-[var(--radius-sm)] border px-3 py-1.5 text-xs font-medium transition-colors ${
              type === t
                ? 'border-accent bg-accent-soft text-ink'
                : 'border-rule bg-paper text-ink-muted hover:text-ink'
            }`}
          >
            {POST_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Goal selector */}
      {ownGoals.length > 0 && type !== 'general_achievement' && (
        <div>
          <label htmlFor="social-post-goal" className="block text-xs font-medium text-ink-muted">
            {type === 'goal_completed' ? 'Completed goal (required)' : 'Linked goal (optional)'}
          </label>
          <select
            id="social-post-goal"
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-sm text-ink"
          >
            <option value="">No linked goal</option>
            {ownGoals
              .filter((g) => (type === 'goal_completed' ? g.status === 'achieved' : true))
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title} ({g.visibility === 'public' ? 'Public' : 'Private'} · {g.status})
                </option>
              ))}
          </select>
        </div>
      )}

      {/* Consent if goal is currently private */}
      {needsGoalPublicConsent && (
        <label className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-warning/40 bg-warning/5 p-3 text-xs text-ink">
          <input
            type="checkbox"
            checked={makeGoalPublic}
            onChange={(e) => setMakeGoalPublic(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-accent"
          />
          <span>
            <strong>“{selectedGoal?.title}” is currently private.</strong> Check this box to make this goal public on
            your profile (only its title and high-level completion counts are shared — never your private notes or daily
            action descriptions).
          </span>
        </label>
      )}

      {/* Headline */}
      <div>
        <label htmlFor="social-post-headline" className="block text-xs font-medium text-ink-muted">
          {type === 'milestone' || type === 'general_achievement'
            ? 'Achievement or milestone title (required)'
            : 'Headline (optional)'}
        </label>
        <input
          id="social-post-headline"
          type="text"
          maxLength={160}
          placeholder={
            type === 'milestone'
              ? 'e.g. Completed 25 consecutive morning sessions'
              : type === 'goal_completed'
                ? 'e.g. Goal completed!'
                : 'e.g. Week 4 progress check-in'
          }
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-sm text-ink"
        />
      </div>

      {/* Body */}
      <div>
        <label htmlFor="social-post-body" className="block text-xs font-medium text-ink-muted">
          What happened, what you learned, or what is next
        </label>
        <textarea
          id="social-post-body"
          rows={3}
          maxLength={2000}
          placeholder="Document the work behind the milestone…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="mt-1 w-full rounded-[var(--radius-sm)] border border-rule bg-paper px-3 py-2 text-sm text-ink"
        />
      </div>

      {/* Include stats checkbox & Image upload */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {goalId && (
          <label className="inline-flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={includeStats}
              onChange={(e) => setIncludeStats(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Include verified progress stats ({selectedGoal?.completedTasks ?? 0}/{selectedGoal?.totalTasks ?? 0} tasks)
          </label>
        )}

        <div className="flex items-center gap-2 text-xs">
          <label className="cursor-pointer font-medium text-accent underline underline-offset-2">
            {imageUrl ? 'Replace photo' : 'Add photo (optional)'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => void handleImageSelect(e)}
              className="sr-only"
            />
          </label>
          {imageUrl && (
            <button
              type="button"
              onClick={() => setImageUrl(null)}
              className="cursor-pointer text-ink-muted hover:text-danger"
            >
              Remove photo
            </button>
          )}
        </div>
      </div>

      {imageUrl && (
        <div className="overflow-hidden rounded-[var(--radius-sm)] border border-rule">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Upload preview" className="max-h-48 w-full object-cover" />
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      {/* Visibility & Submit */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
        <div className="flex items-center gap-2">
          <label htmlFor="social-post-visibility" className="text-xs text-ink-muted">
            Visibility:
          </label>
          <select
            id="social-post-visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as PostVisibility)}
            className="rounded-[var(--radius-sm)] border border-rule bg-paper px-2.5 py-1.5 text-xs text-ink"
          >
            <option value="public">Public (Profile &amp; Followers)</option>
            <option value="private">Private (Only me)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={busy}>
            Publish update
          </Button>
        </div>
      </div>
    </form>
  );
}
