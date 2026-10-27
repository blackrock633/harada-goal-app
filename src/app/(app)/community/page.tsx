import type { Metadata } from 'next';
import { requireCtx } from '@/app/lib/session';
import { getDeps } from '@/infrastructure/container';
import type { SocialPostType } from '@/application/social';
import * as uc from '@/application/use-cases';
import { CommunityHub, type CommunityTab } from '@/ui/features/social';
import { Screen, ScreenHeader } from '@/ui/layout';

export const metadata: Metadata = { title: 'Community' };

const VALID_TABS = new Set<CommunityTab>(['feed', 'discover', 'notifications', 'profile']);
const VALID_POST_TYPES = new Set<SocialPostType>([
  'goal_completed',
  'milestone',
  'progress_update',
  'general_achievement',
  'goal_started',
]);

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireCtx();
  const deps = await getDeps();
  const sp = await searchParams;

  const rawTab = typeof sp.tab === 'string' ? (sp.tab as CommunityTab) : 'feed';
  const initialTab: CommunityTab = VALID_TABS.has(rawTab) ? rawTab : 'feed';

  const composeOpen = sp.compose === '1' || sp.compose === 'true';
  const goalId = typeof sp.goalId === 'string' ? sp.goalId : null;
  const rawType = typeof sp.type === 'string' ? (sp.type as SocialPostType) : undefined;
  const initialType = rawType && VALID_POST_TYPES.has(rawType) ? rawType : undefined;
  const headline = typeof sp.headline === 'string' ? sp.headline : undefined;

  const [feedRes, profileRes, discoverRes, notificationsRes] = await Promise.all([
    uc.getSocialFeed(deps, ctx, { scope: 'following', limit: 20 }),
    uc.getSocialProfile(deps, ctx, { userId: ctx.userId }),
    uc.discoverUsers(deps, ctx, { limit: 16 }),
    uc.listSocialNotifications(deps, ctx, { limit: 30 }),
  ]);

  const initialFeed = feedRes.ok
    ? feedRes.data
    : { items: [], nextCursor: null, followingCount: 0 };

  const initialProfile = profileRes.ok
    ? profileRes.data
    : {
        userId: ctx.userId,
        username: 'athlete',
        displayName: 'Harada Member',
        bio: '',
        location: '',
        website: '',
        avatarUrl: null,
        isPrivate: false,
        restricted: false,
        joinedAt: new Date().toISOString(),
        isOwnProfile: true,
        isFollowing: false,
        followsViewer: false,
        followersCount: 0,
        followingCount: 0,
        stats: {
          goalsCompleted: 0,
          activePublicGoals: 0,
          tasksCompleted: 0,
          postsCount: 0,
        },
        publicGoals: [],
        ownGoals: [],
        recentPosts: [],
      };

  const initialDiscover = discoverRes.ok
    ? discoverRes.data
    : { users: [], recentAchievements: [] };

  const initialNotifications = notificationsRes.ok
    ? notificationsRes.data
    : { items: [], unreadCount: 0 };

  return (
    <Screen width="reading">
      <ScreenHeader
        eyebrow="HARADA COMMUNITY"
        title="Pursuing Ambitious Goals"
        meta="Follow real daily execution, celebrate milestones, and share your progress."
      />
      <CommunityHub
        initialTab={initialTab}
        initialFeed={initialFeed}
        initialProfile={initialProfile}
        initialDiscover={initialDiscover}
        initialNotifications={initialNotifications}
        initialCompose={
          composeOpen
            ? {
                open: true,
                goalId,
                type: initialType,
                headline,
              }
            : undefined
        }
      />
    </Screen>
  );
}
