import * as React from 'react';
import { clsx } from 'clsx';
import {
  ACHIEVEMENT_CATEGORY_LABELS,
  achievementDefinition,
  formatMemberNumber,
} from '@/application/achievements';

export interface AchievementCardData {
  key: string;
  title: string;
  earnedAt: string;
  stat: Record<string, number>;
  goal?: { title: string } | null;
}

export interface AchievementCardProps {
  achievement: AchievementCardData;
  /** Whose achievement it is; printed on the card so it stands alone when shared. */
  holder?: { displayName: string; username: string };
  /** Muted when the owner keeps it off their public profile. */
  hidden?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * A verified achievement as a credential: Harada wordmark, title, the goal it belongs to, the date and the one
 * figure that earned it. Fixed proportions and no interactive chrome, so a screenshot of it reads on its own.
 */
export function AchievementCard({ achievement, holder, hidden, className, children }: AchievementCardProps) {
  const def = achievementDefinition(achievement.key);
  const category = def ? ACHIEVEMENT_CATEGORY_LABELS[def.category] : 'Achievement';
  const isFounding = achievement.key === 'founding_member';
  const statLine = describeStat(achievement);
  const date = formatDate(achievement.earnedAt);

  return (
    <article
      data-testid={`achievement-${achievement.key}`}
      className={clsx(
        'flex min-w-0 flex-col rounded-[var(--radius-md)] border bg-surface p-5',
        isFounding ? 'border-founder/50' : 'border-rule',
        hidden && 'opacity-60',
        className,
      )}
    >
      <header className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-xs tracking-[0.32em] text-ink-muted uppercase">Harada</p>
        <p className={clsx('font-mono text-xs tracking-[0.14em] uppercase', isFounding ? 'text-founder' : 'text-ink-muted')}>
          {category}
        </p>
      </header>

      <h4 className="mt-5 font-serif text-xl leading-snug text-ink">{achievement.title}</h4>
      {achievement.goal && <p className="mt-1 line-clamp-2 text-sm text-ink">{achievement.goal.title}</p>}
      {statLine && <p className="mt-1 text-sm text-ink-muted tabular-nums">{statLine}</p>}

      <div className="mt-auto pt-5">
        <footer className="space-y-0.5 border-t border-rule pt-3">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-ink-muted">
            <span>{holder ? `${holder.displayName} · @${holder.username}` : 'Earned'}</span>
            {date && <time dateTime={achievement.earnedAt}>{date}</time>}
          </p>
          <p className="text-xs text-ink-muted">Verified from activity recorded in Harada</p>
        </footer>
      </div>
      {children}
    </article>
  );
}

function describeStat(a: AchievementCardData): string | null {
  const s = a.stat ?? {};
  switch (a.key) {
    case 'founding_member':
      return typeof s.memberNumber === 'number' ? formatMemberNumber(s.memberNumber) : null;
    case 'plan_complete':
      return '8 key areas · 64 actions';
    case 'actions_100':
    case 'actions_500':
      return typeof s.count === 'number' ? `${s.count} tasks and routine check-ins` : null;
    case 'active_days_30':
    case 'active_days_90':
      return typeof s.days === 'number' ? `${s.days} days with recorded progress` : null;
    case 'challenge_completed':
      return '30 days';
    default:
      return null;
  }
}

function formatDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
