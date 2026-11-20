import * as React from 'react';
import { ACHIEVEMENTS, ACHIEVEMENT_KEYS } from '@/application/achievements';
import type { CommunityMetricsDTO } from '@/application/admin-identity';
import { Block, Stat } from './AdminMetricsView';

const num = (n: number) => new Intl.NumberFormat('en-US').format(n);

/** Profile engagement, social participation, achievement sharing, goal completion and return engagement. */
export function CommunityMetricsView({ metrics: m }: { metrics: CommunityMetricsDTO }) {
  const ev = (name: string) => m.events30d[name] ?? { count: 0, users: 0 };
  const people = (name: string) => `${num(ev(name).users)} people`;
  return (
    <>
      <Block title="Community, last 30 days" note="Counts of recorded events, with the number of distinct members behind them.">
        <Stat label="Profile views" value={num(ev('profile_viewed').count)} note={people('profile_viewed')} />
        <Stat label="Founding badge views" value={num(ev('founding_badge_viewed').count)} note={people('founding_badge_viewed')} />
        <Stat label="Follows" value={num(ev('user_followed').count)} note={people('user_followed')} />
        <Stat label="Progress posts" value={num(ev('progress_post_created').count)} note={people('progress_post_created')} />
        <Stat label="Achievements shared" value={num(ev('achievement_shared').count)} note={people('achievement_shared')} />
        <Stat label="Goals created" value={num(ev('goal_created').count)} note={people('goal_created')} />
        <Stat label="Goals completed" value={num(ev('goal_completed').count)} note={people('goal_completed')} />
        <Stat
          label="Returning members"
          value={num(m.returningMembers28d)}
          note="Active in 2 or more of the last 4 weeks"
        />
      </Block>
      <Block title="Identity">
        <Stat label="Public profiles" value={num(m.publicProfiles)} />
        <Stat label="Public goals" value={num(m.publicGoals)} />
        <Stat label="Founding Members" value={num(m.foundingMembers)} note="of 100" />
        {ACHIEVEMENT_KEYS.filter((k) => k !== 'founding_member').map((k) => (
          <Stat key={k} label={ACHIEVEMENTS[k].title} value={num(m.achievements[k] ?? 0)} note="awarded" />
        ))}
      </Block>
    </>
  );
}
