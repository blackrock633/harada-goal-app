-- Founding 100, verified achievements, goal-progress metrics and profile privacy (docs/IDENTITY_AND_ACHIEVEMENTS.md).
--
-- Concepts kept apart on purpose (each can change without the others):
--   founding_members     an operator-granted designation with a number 1..100. Not a plan, not a subscription.
--                        Table, grant path (admin_entitlement(..., 'founding', ...)) and the complimentary-Pro switch
--                        (billing_settings.founding_complimentary_pro) belong to 20261027120000_monetization.sql;
--                        this migration adds revocation, listing and the identity built on top.
--   user_achievements    facts derived from the user's own recorded activity. No client can write them.
--   plan_of()/plan_grants  entitlements (not touched here).
--
-- Existing social RPCs are extended without restating them: each original is renamed into harada_private as
-- `<name>_base` and a public wrapper of the same name adds the new fields. Callers and grants keep their names.

-- ---------------------------------------------------------------------------
-- 1. Profile display preferences
-- ---------------------------------------------------------------------------
alter table public.social_profiles
  add column show_achievements boolean not null default true,
  add column show_progress_metrics boolean not null default true,
  add column founding_badge_on_posts boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Founding members: the table is defined in 20261027120000_monetization.sql. Grants and revocations are both
--    recorded in public.entitlement_audit (actions 'founding' and 'founding_revoked').
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3. Achievements
-- ---------------------------------------------------------------------------
create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_key text not null,
  /** The goal the achievement belongs to, if any. Deleting the goal deletes the achievement. */
  goal_id uuid references public.goals (id) on delete cascade,
  /** A further subject (the challenge enrollment), if any. */
  ref_id uuid,
  earned_at timestamptz not null,
  stat jsonb not null default '{}'::jsonb,
  /** Owner's choice to keep this one off their public profile. */
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  constraint user_achievements_key_check check (achievement_key in (
    'founding_member', 'first_goal_completed', 'goal_completed', 'plan_complete', 'actions_100', 'actions_500',
    'active_days_30', 'active_days_90', 'challenge_completed')),
  constraint user_achievements_stat_check check (jsonb_typeof(stat) = 'object' and char_length(stat::text) <= 500),
  -- One row per achievement and subject, however often the qualifying data flips back and forth.
  constraint user_achievements_once unique nulls not distinct (user_id, achievement_key, goal_id, ref_id)
);

create index user_achievements_user_idx on public.user_achievements (user_id, earned_at desc);
create index user_achievements_goal_idx on public.user_achievements (goal_id) where goal_id is not null;

alter table public.user_achievements enable row level security;
revoke all on public.user_achievements from public, anon, authenticated;

/** Display title of an achievement (mirrors ACHIEVEMENTS in src/application/achievements.ts; test-guarded). */
create function harada_private.achievement_title(p_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_key
    when 'founding_member' then 'Founding Member'
    when 'first_goal_completed' then 'First Goal Completed'
    when 'goal_completed' then 'Goal Completed'
    when 'plan_complete' then 'Full Plan Built'
    when 'actions_100' then '100 Actions Completed'
    when 'actions_500' then '500 Actions Completed'
    when 'active_days_30' then '30 Days of Progress'
    when 'active_days_90' then '90 Days of Commitment'
    when 'challenge_completed' then '30-Day Challenge Completed'
  end
$$;

/**
 * Verified activity: one row per completed task (current state, so reopening removes it) and one per routine
 * check-in recorded on time. A check-in counts only when it was recorded on its day or up to 2 days later, so
 * back-filling a calendar cannot manufacture streaks. Archived actions do not count; deleted rows cannot.
 */
create function harada_private.verified_activity(p_user uuid)
returns table (goal_id uuid, day date, at timestamptz, kind text)
language sql
stable
security definer
set search_path = ''
as $$
  with tz as (select coalesce((select p.time_zone from public.profiles p where p.id = p_user), 'UTC') as z)
  select a.goal_id, (a.completed_at at time zone tz.z)::date, a.completed_at, 'task'
  from public.actions a
  join public.goals g on g.id = a.goal_id
  cross join tz
  where g.owner_id = p_user and a.kind = 'task' and a.archived_at is null and a.completed_at is not null
  union all
  select a.goal_id, c.date, c.created_at, 'check'
  from public.routine_checks c
  join public.actions a on a.id = c.action_id
  join public.goals g on g.id = a.goal_id
  cross join tz
  where g.owner_id = p_user and a.archived_at is null
    and ((c.created_at at time zone tz.z)::date - c.date) between 0 and 2
$$;

/**
 * Reconciles a user's achievements with their data: inserts what now qualifies, deletes what no longer does
 * (a reopened goal, a deleted goal, a revoked founding designation). A kept achievement keeps its first
 * earned_at and its hidden flag. Idempotent; the only writer of user_achievements.
 */
create function harada_private.sync_achievements(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  select p.time_zone into v_tz from public.profiles p where p.id = p_user;
  if not found then return; end if;

  with
  act as (select * from harada_private.verified_activity(p_user)),
  acts as (select a.at, row_number() over (order by a.at) as rn from act a),
  days as (select d.day, row_number() over (order by d.day) as rn from (select distinct a.day from act a) d),
  achieved as (
    select g.id, g.achieved_at
    from public.goals g
    where g.owner_id = p_user and g.achieved_at is not null
      and (g.status = 'achieved' or (g.status = 'archived' and g.status_before_archive = 'achieved'))
  ),
  desired (achievement_key, goal_id, ref_id, earned_at, stat) as (
    select 'founding_member', null::uuid, null::uuid, f.approved_at, jsonb_build_object('memberNumber', f.member_number)
    from public.founding_members f where f.user_id = p_user
    union all
    select 'goal_completed', a.id, null, a.achieved_at, '{}'::jsonb from achieved a
    union all
    select 'first_goal_completed', null, null, min(a.achieved_at), '{}'::jsonb from achieved a having count(*) > 0
    union all
    select 'plan_complete', g.id, null,
      greatest(
        (select max(o.created_at) from public.outcomes o where o.goal_id = g.id and o.archived_at is null),
        (select max(x.created_at) from public.actions x where x.goal_id = g.id and x.archived_at is null)),
      jsonb_build_object('keyAreas', 8, 'actions', 64)
    from public.goals g
    where g.owner_id = p_user
      and (select count(*) from public.outcomes o where o.goal_id = g.id and o.archived_at is null) = 8
      and (select count(*) from public.actions x where x.goal_id = g.id and x.archived_at is null) = 64
    union all
    select 'actions_100', null, null, s.at, jsonb_build_object('count', 100) from acts s where s.rn = 100
    union all
    select 'actions_500', null, null, s.at, jsonb_build_object('count', 500) from acts s where s.rn = 500
    union all
    select 'active_days_30', null, null, (d.day::timestamp at time zone v_tz), jsonb_build_object('days', 30)
    from days d where d.rn = 30
    union all
    select 'active_days_90', null, null, (d.day::timestamp at time zone v_tz), jsonb_build_object('days', 90)
    from days d where d.rn = 90
    union all
    select 'challenge_completed', e.goal_id, e.id, e.completed_at, jsonb_build_object('days', 30)
    from public.challenge_enrollments e
    where e.user_id = p_user and e.status = 'completed' and e.completed_at is not null
  ),
  removed as (
    delete from public.user_achievements ua
    where ua.user_id = p_user
      and not exists (
        select 1 from desired d
        where d.achievement_key = ua.achievement_key
          and d.goal_id is not distinct from ua.goal_id
          and d.ref_id is not distinct from ua.ref_id)
  )
  insert into public.user_achievements as t (user_id, achievement_key, goal_id, ref_id, earned_at, stat)
  select p_user, d.achievement_key, d.goal_id, d.ref_id, d.earned_at, d.stat from desired d
  on conflict on constraint user_achievements_once do update set stat = excluded.stat
    where t.stat is distinct from excluded.stat;
end;
$$;

/**
 * Deferred trigger body: reconciles the owner's achievements once per transaction, at commit, after every
 * write of that transaction is in place. A failure here is logged and never blocks the user's own write.
 */
create function harada_private.achievements_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_flag text;
  v_row record;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  if tg_table_name = 'goals' then
    v_owner := v_row.owner_id;
  elsif tg_table_name in ('challenge_enrollments', 'founding_members') then
    v_owner := v_row.user_id;
  elsif tg_table_name in ('actions', 'outcomes') then
    select g.owner_id into v_owner from public.goals g where g.id = v_row.goal_id;
  elsif tg_table_name = 'routine_checks' then
    select g.owner_id into v_owner
    from public.actions a join public.goals g on g.id = a.goal_id where a.id = v_row.action_id;
  end if;
  -- A goal deleted in this transaction takes its children with it; its own row trigger carries the owner.
  if v_owner is null then return null; end if;

  v_flag := 'harada.ach_' || replace(v_owner::text, '-', '');
  if coalesce(current_setting(v_flag, true), '') = '1' then return null; end if;
  perform set_config(v_flag, '1', true);
  begin
    perform harada_private.sync_achievements(v_owner);
  exception when others then
    raise warning 'achievement sync failed (%)', sqlstate;
  end;
  return null;
end;
$$;

create constraint trigger goals_achievements after insert or update or delete on public.goals
  deferrable initially deferred for each row execute function harada_private.achievements_touch();
create constraint trigger outcomes_achievements after insert or update or delete on public.outcomes
  deferrable initially deferred for each row execute function harada_private.achievements_touch();
create constraint trigger actions_achievements after insert or update or delete on public.actions
  deferrable initially deferred for each row execute function harada_private.achievements_touch();
create constraint trigger routine_checks_achievements after insert or delete on public.routine_checks
  deferrable initially deferred for each row execute function harada_private.achievements_touch();
create constraint trigger challenge_achievements after insert or update on public.challenge_enrollments
  deferrable initially deferred for each row execute function harada_private.achievements_touch();
create constraint trigger founding_achievements after insert or delete on public.founding_members
  deferrable initially deferred for each row execute function harada_private.achievements_touch();

-- ---------------------------------------------------------------------------
-- 4. Goal progress metrics (definitions: docs/IDENTITY_AND_ACHIEVEMENTS.md §3)
-- ---------------------------------------------------------------------------
create function harada_private.goal_progress_metrics(p_goal uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  g public.goals;
  v_tz text;
  v_end date;
  v_start date;
  v_days int;
  v_active int;
  v_tasks_done int;
  v_tasks_total int;
  v_checkins int;
  v_areas_total int;
  v_areas_done int;
  v_status text;
begin
  select * into g from public.goals where id = p_goal;
  if not found then return null; end if;
  select coalesce(p.time_zone, 'UTC') into v_tz from public.profiles p where p.id = g.owner_id;
  v_status := case when g.status = 'archived' then g.status_before_archive else g.status end;

  select count(*) filter (where a.completed_at is not null)::int, count(*)::int
  into v_tasks_done, v_tasks_total
  from public.actions a where a.goal_id = p_goal and a.kind = 'task' and a.archived_at is null;

  select count(*)::int into v_checkins
  from harada_private.verified_activity(g.owner_id) v
  where v.goal_id = p_goal and v.kind = 'check';

  select count(*)::int,
         count(*) filter (where
           (o.measure_target is not null and o.measure_current >= o.measure_target)
           or (o.measure_target is null
               and exists (select 1 from public.actions a
                           where a.outcome_id = o.id and a.kind = 'task' and a.archived_at is null)
               and not exists (select 1 from public.actions a
                               where a.outcome_id = o.id and a.kind = 'task' and a.archived_at is null
                                 and a.completed_at is null)))::int
  into v_areas_total, v_areas_done
  from public.outcomes o where o.goal_id = p_goal and o.archived_at is null;

  if g.activated_on is not null then
    v_end := case when v_status = 'achieved' and g.achieved_at is not null
                  then (g.achieved_at at time zone v_tz)::date
                  else (now() at time zone v_tz)::date end;
    v_days := greatest(v_end - g.activated_on + 1, 0);
    v_start := greatest(g.activated_on, v_end - 29);
    select count(distinct v.day)::int into v_active
    from harada_private.verified_activity(g.owner_id) v
    where v.goal_id = p_goal and v.day between v_start and v_end;
  end if;

  return jsonb_build_object(
    'daysPursuing', v_days,
    'actionsCompleted', v_tasks_done + v_checkins,
    'tasksCompleted', v_tasks_done,
    'tasksTotal', v_tasks_total,
    'routineCheckins', v_checkins,
    'keyAreasComplete', v_areas_done,
    'keyAreasTotal', v_areas_total,
    'consistency', case when v_start is null or v_end < v_start then null else jsonb_build_object(
      'activeDays', v_active,
      'windowDays', v_end - v_start + 1,
      'rate', round(v_active::numeric / (v_end - v_start + 1), 4)) end
  );
end;
$$;

/** The founding number to show next to a user's name in posts, honouring their preference; else null. */
create function harada_private.founding_number_on_posts(p_user uuid)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select f.member_number from public.founding_members f
  join public.social_profiles s on s.user_id = f.user_id
  where f.user_id = p_user and s.founding_badge_on_posts
$$;

-- ---------------------------------------------------------------------------
-- 5. Achievement posts
-- ---------------------------------------------------------------------------
alter table public.social_posts drop constraint social_posts_type_check;
alter table public.social_posts add constraint social_posts_type_check check (
  type in ('goal_completed', 'milestone', 'progress_update', 'general_achievement', 'goal_started', 'achievement'));
alter table public.social_posts
  add column achievement_id uuid references public.user_achievements (id) on delete cascade,
  add constraint social_posts_achievement_check check ((type = 'achievement') = (achievement_id is not null));
-- One post per achievement.
create unique index social_posts_achievement_unique_idx on public.social_posts (achievement_id)
  where achievement_id is not null;

/** The title of a verified achievement post is the achievement's own; it cannot be rewritten afterwards. */
create function harada_private.guard_achievement_post()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.type = 'achievement' and (new.type <> old.type or new.achievement_id is distinct from old.achievement_id
                                   or new.headline <> old.headline) then
    perform harada_private.fail('INVALID_STATE', 'The title of an achievement post cannot be changed', 'headline');
  end if;
  return new;
end;
$$;

create trigger social_posts_guard_achievement before update on public.social_posts
  for each row execute function harada_private.guard_achievement_post();

-- hydrate_post: + author.foundingMemberNumber, + achievement
alter function harada_private.hydrate_post(uuid, uuid, boolean) rename to hydrate_post_base;

create function harada_private.hydrate_post(p_viewer uuid, p_post_id uuid, p_view_as_public boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb := harada_private.hydrate_post_base(p_viewer, p_post_id, p_view_as_public);
  v_author uuid;
  v_ach_id uuid;
  v_ach jsonb := null;
begin
  if v is null then return null; end if;
  select sp.author_id, sp.achievement_id into v_author, v_ach_id from public.social_posts sp where sp.id = p_post_id;
  if v_ach_id is not null then
    select jsonb_build_object(
      'id', ua.id, 'key', ua.achievement_key, 'title', harada_private.achievement_title(ua.achievement_key),
      'earnedAt', ua.earned_at, 'stat', ua.stat)
    into v_ach from public.user_achievements ua where ua.id = v_ach_id;
  end if;
  return v || jsonb_build_object(
    'author', (v -> 'author') || jsonb_build_object('foundingMemberNumber', harada_private.founding_number_on_posts(v_author)),
    'achievement', v_ach);
end;
$$;

-- create_social_post: + type 'achievement' {type, achievementId, visibility?, body?, id?}
alter function public.create_social_post(jsonb) rename to create_social_post_base;
alter function public.create_social_post_base(jsonb) set schema harada_private;

create function public.create_social_post(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_ach public.user_achievements;
  v_existing uuid;
  v_vis text := 'public';
  v_body text;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform harada_private.fail('VALIDATION', 'Invalid input');
  end if;
  if coalesce(p_input ->> 'type', '') <> 'achievement' then
    return harada_private.create_social_post_base(p_input);
  end if;

  v_id := coalesce(harada_private.opt_uuid(p_input, 'id'), gen_random_uuid());
  if exists (select 1 from public.social_posts sp where sp.id = v_id and sp.author_id = v_uid) then
    return harada_private.hydrate_post(v_uid, v_id, false);
  end if;

  select * into v_ach from public.user_achievements
  where id = harada_private.req_uuid(p_input, 'achievementId') and user_id = v_uid;
  if not found then perform harada_private.fail('NOT_FOUND', 'Achievement not found', 'achievementId'); end if;

  -- Sharing the same achievement twice returns the post that already exists.
  select sp.id into v_existing from public.social_posts sp where sp.achievement_id = v_ach.id;
  if v_existing is not null then return harada_private.hydrate_post(v_uid, v_existing, false); end if;

  perform harada_private.check_social_rate_limit(v_uid, 'create_post', 20, interval '15 minutes');

  if harada_private.has(p_input, 'visibility') then
    v_vis := harada_private.txt(p_input, 'visibility', 16, true);
    if v_vis not in ('public', 'private') then
      perform harada_private.fail('VALIDATION', 'Choose public or private', 'visibility');
    end if;
  end if;
  v_body := coalesce(harada_private.txt(p_input, 'body', 2000, false), '');

  if v_vis = 'public' and v_ach.goal_id is not null and not harada_private.is_goal_public(v_ach.goal_id) then
    perform harada_private.fail(
      'INVALID_STATE', 'This achievement belongs to a private goal. Make the goal public, or post as private.',
      'visibility');
  end if;

  insert into public.social_posts (id, author_id, goal_id, type, visibility, headline, body, achievement_id,
                                   created_at, updated_at)
  values (v_id, v_uid, v_ach.goal_id, 'achievement', v_vis, harada_private.achievement_title(v_ach.achievement_key),
          v_body, v_ach.id, harada_private.now_ms(), harada_private.now_ms());

  if v_vis = 'public'
     and not coalesce((select s.is_private from public.social_profiles s where s.user_id = v_uid), false) then
    insert into public.social_notifications (recipient_id, actor_id, kind, post_id)
    select f.follower_id, v_uid, 'followed_milestone', v_id
    from public.social_follows f
    where f.following_id = v_uid and not harada_private.is_blocked_between(v_uid, f.follower_id)
    limit 200;
  end if;

  return harada_private.hydrate_post(v_uid, v_id, false);
exception
  when unique_violation then
    perform harada_private.fail('CONFLICT', 'This achievement has already been shared');
    return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Profiles: identity, primary goal, metrics, achievements, privacy
-- ---------------------------------------------------------------------------
alter function public.get_social_profile(jsonb) rename to get_social_profile_base;
alter function public.get_social_profile_base(jsonb) set schema harada_private;

/**
 * get_social_profile + {foundingMember, primaryGoal, achievements, privacy}.
 * primaryGoal comes from public goals only (what the owner sees is what others see); its metrics are omitted for
 * other viewers when the owner hides them. Achievements tied to a goal are shown to others only while that goal
 * is public; the owner may hide any achievement, or all of them.
 */
create function public.get_social_profile(p_input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base jsonb := harada_private.get_social_profile_base(p_input);
  v_target uuid := (v_base ->> 'userId')::uuid;
  v_view_as_public boolean := coalesce((p_input -> 'viewAsPublic') = 'true'::jsonb, false);
  v_own boolean := (v_base ->> 'isOwnProfile')::boolean;
  v_owner_view boolean := v_own and not v_view_as_public;
  v_soc public.social_profiles;
  v_goal public.goals;
  v_founding jsonb := null;
  v_primary jsonb := null;
  v_achievements jsonb := '[]'::jsonb;
begin
  select * into v_soc from public.social_profiles where user_id = v_target;

  select jsonb_build_object('number', f.member_number, 'since', f.approved_at) into v_founding
  from public.founding_members f where f.user_id = v_target;

  if not (v_base ->> 'restricted')::boolean then
    select g.* into v_goal
    from public.goals g join public.goal_visibility gv on gv.goal_id = g.id
    where g.owner_id = v_target and gv.visibility = 'public' and g.status in ('active', 'achieved')
    order by (g.status = 'active') desc, g.activated_on desc nulls last, g.achieved_at desc nulls last, g.updated_at desc
    limit 1;
    if found then
      v_primary := jsonb_build_object(
        'id', v_goal.id,
        'title', v_goal.title,
        'status', v_goal.status,
        'activatedOn', v_goal.activated_on,
        'targetDate', v_goal.target_date,
        'achievedAt', v_goal.achieved_at,
        'metrics', case when v_owner_view or v_soc.show_progress_metrics
                        then harada_private.goal_progress_metrics(v_goal.id) end);
    end if;

    if v_owner_view or v_soc.show_achievements then
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', ua.id,
          'key', ua.achievement_key,
          'title', harada_private.achievement_title(ua.achievement_key),
          'earnedAt', ua.earned_at,
          'stat', ua.stat,
          'hidden', ua.hidden,
          'goal', case when ua.goal_id is null then null
                       else (select jsonb_build_object('id', g.id, 'title', g.title)
                             from public.goals g where g.id = ua.goal_id) end,
          'postId', (select sp.id from public.social_posts sp where sp.achievement_id = ua.id)
        ) order by ua.earned_at desc, ua.achievement_key), '[]'::jsonb)
      into v_achievements
      from public.user_achievements ua
      where ua.user_id = v_target
        and (v_owner_view
             or (not ua.hidden and (ua.goal_id is null or harada_private.is_goal_public(ua.goal_id))));
    end if;
  end if;

  return v_base || jsonb_build_object(
    'foundingMember', v_founding,
    'primaryGoal', v_primary,
    'achievements', v_achievements,
    'privacy', case when v_own then jsonb_build_object(
      'showAchievements', v_soc.show_achievements,
      'showProgressMetrics', v_soc.show_progress_metrics,
      'foundingBadgeOnPosts', v_soc.founding_badge_on_posts) end);
end;
$$;

-- update_social_profile: + showAchievements, showProgressMetrics, foundingBadgeOnPosts
alter function public.update_social_profile(jsonb) rename to update_social_profile_base;
alter function public.update_social_profile_base(jsonb) set schema harada_private;

create function public.update_social_profile(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  k text;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform harada_private.fail('VALIDATION', 'Invalid input');
  end if;
  foreach k in array array['showAchievements', 'showProgressMetrics', 'foundingBadgeOnPosts'] loop
    if harada_private.has(p_input, k) and jsonb_typeof(p_input -> k) <> 'boolean' then
      perform harada_private.fail('VALIDATION', 'Invalid privacy setting', k);
    end if;
  end loop;

  update public.social_profiles set
    show_achievements = coalesce((p_input ->> 'showAchievements')::boolean, show_achievements),
    show_progress_metrics = coalesce((p_input ->> 'showProgressMetrics')::boolean, show_progress_metrics),
    founding_badge_on_posts = coalesce((p_input ->> 'foundingBadgeOnPosts')::boolean, founding_badge_on_posts)
  where user_id = v_uid;

  return harada_private.update_social_profile_base(
    p_input - 'showAchievements' - 'showProgressMetrics' - 'foundingBadgeOnPosts');
end;
$$;

/** {achievementId, hidden}: keeps one achievement off (or back on) the caller's public profile. */
create function public.set_achievement_visibility(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform harada_private.fail('VALIDATION', 'Invalid input');
  end if;
  v_id := harada_private.req_uuid(p_input, 'achievementId');
  if jsonb_typeof(p_input -> 'hidden') is distinct from 'boolean' then
    perform harada_private.fail('VALIDATION', 'Invalid setting', 'hidden');
  end if;
  update public.user_achievements set hidden = (p_input ->> 'hidden')::boolean
  where id = v_id and user_id = v_uid;
  if not found then perform harada_private.fail('NOT_FOUND', 'Achievement not found'); end if;
  return jsonb_build_object('achievementId', v_id, 'hidden', (p_input ->> 'hidden')::boolean);
end;
$$;

-- discover_users: + foundingMemberNumber on each user (shown like a name badge, so it honours the post preference)
alter function public.discover_users(jsonb) rename to discover_users_base;
alter function public.discover_users_base(jsonb) set schema harada_private;

create function public.discover_users(p_input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb := harada_private.discover_users_base(p_input);
begin
  return v || jsonb_build_object('users', (
    select coalesce(jsonb_agg(u.val || jsonb_build_object(
             'foundingMemberNumber', harada_private.founding_number_on_posts((u.val ->> 'userId')::uuid))
           order by u.ord), '[]'::jsonb)
    from jsonb_array_elements(v -> 'users') with ordinality as u(val, ord)));
end;
$$;

/** Accounts the caller has blocked, newest first (for the unblock list). */
create function public.list_blocked_users(p_input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  return jsonb_build_object('items', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'userId', b.blocked_id, 'username', s.username, 'displayName', p.display_name, 'blockedAt', b.created_at)
           order by b.created_at desc), '[]'::jsonb)
    from public.social_blocks b
    join public.profiles p on p.id = b.blocked_id
    join public.social_profiles s on s.user_id = b.blocked_id
    where b.blocker_id = v_uid));
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Analytics: new events, recorded by the database where it can see the fact itself
-- ---------------------------------------------------------------------------
alter table public.analytics_events drop constraint analytics_name_check;
alter table public.analytics_events add constraint analytics_name_check check (name in (
  'landing_page_viewed', 'signup_started', 'signup_completed', 'onboarding_started', 'goal_created',
  'supporting_area_created', 'first_action_created', 'first_action_completed', 'weekly_review_completed',
  'challenge_joined', 'challenge_day_completed', 'challenge_completed', 'progress_card_generated',
  'share_link_created', 'shared_page_viewed', 'referral_signup_completed', 'upgrade_page_viewed',
  'upgrade_prompt_shown', 'checkout_started', 'subscription_activated', 'subscription_cancelled',
  'premium_feature_used',
  'profile_viewed', 'user_followed', 'progress_post_created', 'achievement_shared', 'founding_badge_viewed',
  'goal_completed'));

create or replace function public.track_event(p_name text, p_props jsonb default '{}'::jsonb, p_anon_id text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  k text;
  v jsonb;
begin
  -- Server-side events are recorded by the database itself and cannot be sent by a client.
  if p_name in ('subscription_activated', 'subscription_cancelled', 'referral_signup_completed', 'challenge_joined',
                'share_link_created', 'profile_viewed', 'user_followed', 'progress_post_created',
                'achievement_shared', 'founding_badge_viewed', 'goal_completed') then
    perform harada_private.fail('VALIDATION', 'Recorded by the server', 'name');
  end if;
  if p_props is null then p_props := '{}'::jsonb; end if;
  if jsonb_typeof(p_props) <> 'object' then perform harada_private.fail('VALIDATION', 'Invalid properties', 'props'); end if;
  for k, v in select key, value from jsonb_each(p_props) loop
    if k <> all (array['source', 'platform', 'plan', 'price', 'interval', 'kind', 'format', 'feature', 'template_tier',
                        'step', 'day', 'count', 'weeks', 'referred']) then
      perform harada_private.fail('VALIDATION', 'Unknown property', 'props');
    end if;
    if not (jsonb_typeof(v) in ('number', 'boolean')
            or (jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[a-z0-9_]{1,32}$')) then
      perform harada_private.fail('VALIDATION', 'Properties must be numbers, booleans or short tokens', 'props');
    end if;
  end loop;
  if v_uid is null and (p_anon_id is null or p_anon_id !~ '^[A-Za-z0-9_-]{8,64}$') then
    perform harada_private.fail('VALIDATION', 'Missing visitor id', 'anonId');
  end if;
  if (select count(*) from public.analytics_events e
      where e.occurred_at > now() - interval '1 hour'
        and ((v_uid is not null and e.user_id = v_uid) or (v_uid is null and e.anon_id = p_anon_id))) >= 120 then
    return;
  end if;
  insert into public.analytics_events (name, user_id, anon_id, props)
  values (p_name, v_uid, case when v_uid is null then p_anon_id end, p_props);
end;
$$;

/** Social facts recorded where they happen. Props carry only enum-like tokens; never ids, titles or text. */
create function harada_private.track_social_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'social_follows' then
    insert into public.analytics_events (name, user_id) values ('user_followed', new.follower_id);
  elsif tg_table_name = 'social_posts' then
    if new.type = 'achievement' then
      insert into public.analytics_events (name, user_id, props)
      select 'achievement_shared', new.author_id, jsonb_build_object('kind', ua.achievement_key)
      from public.user_achievements ua where ua.id = new.achievement_id;
    else
      insert into public.analytics_events (name, user_id, props)
      values ('progress_post_created', new.author_id, jsonb_build_object('kind', new.type));
    end if;
  elsif tg_table_name = 'goals' then
    insert into public.analytics_events (name, user_id) values ('goal_completed', new.owner_id);
  end if;
  return null;
end;
$$;

create trigger social_follows_track after insert on public.social_follows
  for each row execute function harada_private.track_social_event();
create trigger social_posts_track after insert on public.social_posts
  for each row execute function harada_private.track_social_event();
create trigger goals_track_completed after update of status on public.goals
  for each row when (new.status = 'achieved' and old.status is distinct from 'achieved')
  execute function harada_private.track_social_event();

/**
 * {userId}: records that the caller viewed another member's profile, and that they saw a Founding Member badge
 * when the profile carries one. Own views, blocked pairs and unknown users record nothing. Shares the 120/hour cap.
 */
create function public.record_profile_view(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform harada_private.fail('VALIDATION', 'Invalid input');
  end if;
  v_target := harada_private.req_uuid(p_input, 'userId');
  if v_target = v_uid
     or not exists (select 1 from public.profiles p where p.id = v_target)
     or harada_private.is_blocked_between(v_uid, v_target)
     or (select count(*) from public.analytics_events e
         where e.user_id = v_uid and e.occurred_at > now() - interval '1 hour') >= 120 then
    return jsonb_build_object('recorded', false);
  end if;
  insert into public.analytics_events (name, user_id) values ('profile_viewed', v_uid);
  if exists (select 1 from public.founding_members f where f.user_id = v_target) then
    insert into public.analytics_events (name, user_id) values ('founding_badge_viewed', v_uid);
  end if;
  return jsonb_build_object('recorded', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Operator RPCs. Every one checks public.admins on the server; nothing is decided by the client.
-- ---------------------------------------------------------------------------
create function harada_private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.admins a where a.user_id = v_uid) then
    perform harada_private.fail('FORBIDDEN', 'Not allowed');
  end if;
  return v_uid;
end;
$$;

/** {query}: members by username, display name or exact user id (max 20). No email or other private data. */
create function public.admin_search_users(p_input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text;
begin
  perform harada_private.require_admin();
  v_q := lower(regexp_replace(coalesce(harada_private.txt(p_input, 'query', 80, true), ''), '^@+', ''));
  if char_length(v_q) < 2 then perform harada_private.fail('VALIDATION', 'Type at least 2 characters', 'query'); end if;
  return jsonb_build_object('items', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'userId', p.id, 'username', s.username, 'displayName', p.display_name, 'joinedAt', p.created_at,
             'foundingMemberNumber', f.member_number)
           order by (s.username = v_q) desc, p.created_at), '[]'::jsonb)
    from (
      select p.* from public.profiles p
      join public.social_profiles s on s.user_id = p.id
      where p.id::text = v_q
         or s.username like '%' || replace(replace(v_q, '%', ''), '_', '\_') || '%'
         or lower(p.display_name) like '%' || replace(replace(v_q, '%', ''), '_', '\_') || '%'
      order by p.created_at
      limit 20
    ) p
    join public.social_profiles s on s.user_id = p.id
    left join public.founding_members f on f.user_id = p.id));
end;
$$;

/**
 * {userId, reason}: removes the designation and records why. Takes the same lock as the grant path in
 * admin_entitlement(), so a revocation and a grant never interleave. Numbers are allocated as max + 1 there, so a
 * revoked number is reissued only when it was the highest one. A complimentary Pro grant, if one was made, is an
 * entitlement and is revoked separately with admin_entitlement(..., 'revoke', ...).
 */
create function public.admin_revoke_founding_member(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := harada_private.require_admin();
  v_target uuid;
  v_reason text;
  v_number integer;
begin
  v_target := harada_private.req_uuid(p_input, 'userId');
  v_reason := harada_private.txt(p_input, 'reason', 500, true);
  if char_length(v_reason) < 3 then perform harada_private.fail('VALIDATION', 'An audit reason is required', 'reason'); end if;

  perform pg_advisory_xact_lock(100271);
  delete from public.founding_members where user_id = v_target returning member_number into v_number;
  if v_number is null then perform harada_private.fail('NOT_FOUND', 'Not a Founding Member', 'userId'); end if;

  insert into public.entitlement_audit (actor, user_id, action, reason)
  values (v_admin, v_target, 'founding_revoked', format('No. %s: %s', v_number, v_reason));
  return jsonb_build_object('userId', v_target, 'memberNumber', v_number, 'revoked', true);
end;
$$;

/** All Founding Members, the places left under max + 1 allocation, and the latest 50 founding audit entries. */
create function public.admin_founding_members()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform harada_private.require_admin();
  return jsonb_build_object(
    'capacity', 100,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'userId', f.user_id, 'memberNumber', f.member_number, 'approvedAt', f.approved_at,
               'username', s.username, 'displayName', p.display_name, 'approvedBy', a.username)
             order by f.member_number), '[]'::jsonb)
      from public.founding_members f
      join public.profiles p on p.id = f.user_id
      join public.social_profiles s on s.user_id = f.user_id
      left join public.social_profiles a on a.user_id = f.approved_by),
    'nextNumber', (select case when coalesce(max(member_number), 0) >= 100 then null
                               else coalesce(max(member_number), 0) + 1 end from public.founding_members),
    'remaining', (select 100 - coalesce(max(member_number), 0) from public.founding_members),
    'audit', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', l.id, 'action', l.action, 'reason', l.reason, 'occurredAt', l.occurred_at,
               'actor', a.username, 'target', t.username)
             order by l.occurred_at desc, l.id desc), '[]'::jsonb)
      from (select * from public.entitlement_audit e where e.action in ('founding', 'founding_revoked')
            order by e.occurred_at desc, e.id desc limit 50) l
      left join public.social_profiles a on a.user_id = l.actor
      left join public.social_profiles t on t.user_id = l.user_id));
end;
$$;

/**
 * Community health for operators, last 30 days unless noted. "Returning" = members with recorded activity
 * (analytics events, completed tasks, routine check-ins) in at least 2 of the last 4 weeks.
 */
create function public.admin_community_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform harada_private.require_admin();
  return jsonb_build_object(
    'events30d', (
      select coalesce(jsonb_object_agg(x.name, jsonb_build_object('count', x.n, 'users', x.u)), '{}'::jsonb)
      from (select e.name, count(*)::int n, count(distinct e.user_id)::int u
            from public.analytics_events e
            where e.occurred_at > now() - interval '30 days'
              and e.name in ('profile_viewed', 'user_followed', 'progress_post_created', 'achievement_shared',
                             'founding_badge_viewed', 'goal_created', 'goal_completed')
            group by e.name) x),
    'returningMembers28d', (
      select count(*)::int from (
        select w.user_id from (
          select e.user_id, date_trunc('week', e.occurred_at) wk from public.analytics_events e
          where e.user_id is not null and e.occurred_at > now() - interval '28 days'
          union
          select g.owner_id, date_trunc('week', a.completed_at) from public.actions a join public.goals g on g.id = a.goal_id
          where a.completed_at > now() - interval '28 days'
          union
          select g.owner_id, date_trunc('week', c.created_at) from public.routine_checks c
          join public.actions a on a.id = c.action_id join public.goals g on g.id = a.goal_id
          where c.created_at > now() - interval '28 days'
        ) w group by w.user_id having count(distinct w.wk) >= 2) r),
    'achievements', (
      select coalesce(jsonb_object_agg(x.achievement_key, x.n), '{}'::jsonb)
      from (select achievement_key, count(*)::int n from public.user_achievements group by achievement_key) x),
    'publicProfiles', (select count(*)::int from public.social_profiles where not is_private),
    'publicGoals', (select count(*)::int from public.goal_visibility where visibility = 'public'),
    'foundingMembers', (select count(*)::int from public.founding_members)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Privileges
-- ---------------------------------------------------------------------------
revoke all on function
  harada_private.achievement_title(text),
  harada_private.verified_activity(uuid),
  harada_private.sync_achievements(uuid),
  harada_private.achievements_touch(),
  harada_private.goal_progress_metrics(uuid),
  harada_private.founding_number_on_posts(uuid),
  harada_private.guard_achievement_post(),
  harada_private.hydrate_post_base(uuid, uuid, boolean),
  harada_private.hydrate_post(uuid, uuid, boolean),
  harada_private.create_social_post_base(jsonb),
  harada_private.get_social_profile_base(jsonb),
  harada_private.update_social_profile_base(jsonb),
  harada_private.discover_users_base(jsonb),
  harada_private.track_social_event(),
  harada_private.require_admin()
from public, anon, authenticated;

revoke all on function
  public.create_social_post(jsonb),
  public.get_social_profile(jsonb),
  public.update_social_profile(jsonb),
  public.set_achievement_visibility(jsonb),
  public.discover_users(jsonb),
  public.list_blocked_users(jsonb),
  public.record_profile_view(jsonb),
  public.admin_search_users(jsonb),
  public.admin_revoke_founding_member(jsonb),
  public.admin_founding_members(),
  public.admin_community_metrics()
from public, anon;

grant execute on function
  public.create_social_post(jsonb),
  public.get_social_profile(jsonb),
  public.update_social_profile(jsonb),
  public.set_achievement_visibility(jsonb),
  public.discover_users(jsonb),
  public.list_blocked_users(jsonb),
  public.record_profile_view(jsonb),
  public.admin_search_users(jsonb),
  public.admin_revoke_founding_member(jsonb),
  public.admin_founding_members(),
  public.admin_community_metrics()
to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Backfill: achievements already earned by existing activity
-- ---------------------------------------------------------------------------
select harada_private.sync_achievements(p.id) from public.profiles p;
