/**
 * Route map for the mobile-first app shell. UI-owned; the single source for hrefs.
 *
 * Four primary destinations (bottom tab bar on phones, left rail on desktop):
 *   Today · My Goal · Matrix · Review
 * "My Goal", "Matrix" and "Review" act on the *focused* goal. The focused goal is chosen
 * via `?goal=<id>` and falls back to the most recently activated active goal.
 */
export const routes = {
  today: '/today',
  goal: (goalId?: string) => withGoal('/goal', goalId),
  goalNew: '/goal/new',
  goalEdit: (goalId: string) => withGoal('/goal/edit', goalId),
  matrix: (goalId?: string) => withGoal('/matrix', goalId),
  /** Key-area detail. `position` is the outcome slot 0..7 (works for empty slots too). */
  keyArea: (goalId: string, position: number) => withGoal(`/matrix/${position}`, goalId),
  review: (goalId?: string) => withGoal('/review', goalId),
  community: '/community',
  communityShare: (opts?: { goalId?: string; type?: string }) => {
    const q = new URLSearchParams();
    q.set('tab', 'feed');
    q.set('compose', '1');
    if (opts?.goalId) q.set('goalId', opts.goalId);
    if (opts?.type) q.set('type', opts.type);
    return `/community?${q.toString()}`;
  },
  profile: (username: string) => `/u/${encodeURIComponent(username)}`,
  settings: '/settings',
  signIn: '/signin',
  signUp: '/signup',
  /** Sign-up carrying a validated referral code and/or a post-sign-up destination. */
  signUpWith: (opts: { ref?: string; next?: string }) => {
    const q = new URLSearchParams();
    if (opts.ref) q.set('ref', opts.ref);
    if (opts.next) q.set('next', opts.next);
    const s = q.toString();
    return s ? `/signup?${s}` : '/signup';
  },
  home: '/',
  pricing: '/pricing',
  challenge: '/challenge',
  accountBilling: '/account/billing',
} as const;

function withGoal(path: string, goalId?: string): string {
  return goalId ? `${path}?goal=${encodeURIComponent(goalId)}` : path;
}

export const primaryTabs = [
  { key: 'today', label: 'Today', href: () => routes.today },
  { key: 'goal', label: 'My Goal', href: (g?: string) => routes.goal(g) },
  { key: 'matrix', label: 'Matrix', href: (g?: string) => routes.matrix(g) },
  { key: 'review', label: 'Review', href: (g?: string) => routes.review(g) },
] as const;
