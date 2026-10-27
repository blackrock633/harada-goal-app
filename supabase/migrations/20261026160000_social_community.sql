-- Social Community System ("Strava for achieving your goals")
--
-- Tables:
--   public.social_profiles      1-to-1 social identity (unique username, bio, location, website, avatar_url, is_private)
--   public.goal_visibility      Explicit per-goal visibility ('private' default, 'public' opt-in)
--   public.social_follows       One-way follow graph (follower_id -> following_id)
--   public.social_blocks        Abuse-prevention block list (blocker_id -> blocked_id)
--   public.social_posts         Shared achievements & updates (goal_completed, milestone, progress_update, general_achievement, goal_started)
--   public.social_likes         One like per user per post
--   public.social_comments      Chronological comments on posts (deletable by comment author or post owner)
--   public.social_hidden_posts  Posts hidden from a viewer's feed
--   public.social_reports       Abuse reports on posts
--   public.social_notifications In-app notifications (new_follower, post_liked, post_commented, followed_milestone)
--   public.social_rate_limits   Per-user sliding-window rate limiting for social mutations
--
-- Security model:
--   All tables have RLS enabled and zero direct table grants to anon/authenticated.
--   All reads and writes go through curated SECURITY DEFINER functions in `public` that pin `search_path = ''`,
--   authenticate via `auth.uid()`, and enforce goal visibility, profile privacy, ownership, and block rules.

-- ---------------------------------------------------------------------------
-- 1. Username generation helper & social_profiles
-- ---------------------------------------------------------------------------
create function harada_private.generate_default_username(p_display_name text, p_user_id uuid)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_base text;
  v_suffix text := substr(replace(p_user_id::text, '-', ''), 1, 6);
begin
  v_base := lower(regexp_replace(coalesce(p_display_name, 'user'), '[^a-zA-Z0-9_]+', '_', 'g'));
  v_base := regexp_replace(v_base, '^_+|_+$', '', 'g');
  v_base := regexp_replace(v_base, '_+', '_', 'g');
  if char_length(v_base) < 3 then
    v_base := 'member';
  end if;
  v_base := left(v_base, 20);
  return v_base || '_' || v_suffix;
end;
$$;

revoke all on function harada_private.generate_default_username(text, uuid) from public, anon, authenticated;

create table public.social_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  username text not null,
  bio text not null default '',
  location text not null default '',
  website text not null default '',
  avatar_url text,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_profiles_username_format_check check (
    username = lower(username) and username ~ '^[a-z0-9_]{3,30}$'
  ),
  constraint social_profiles_bio_len_check check (char_length(bio) <= 280),
  constraint social_profiles_location_len_check check (char_length(location) <= 80),
  constraint social_profiles_website_check check (
    website = '' or (char_length(website) <= 200 and website ~ '^https?://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/.*)?$')
  ),
  -- Photos are JPEGs re-encoded on the device (metadata such as GPS stripped). '/9j/' is the base64 of the
  -- JPEG signature FF D8 FF, so this checks the bytes, not just the declared type. No remote URLs: a viewer's
  -- device never contacts a third-party host to show a profile.
  constraint social_profiles_avatar_check check (
    avatar_url is null or (
      char_length(avatar_url) <= 60000 and avatar_url ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]+={0,2}$'
    )
  )
);

create unique index social_profiles_username_unique_idx on public.social_profiles (lower(username));
create index social_profiles_public_created_idx on public.social_profiles (created_at desc) where (not is_private);

alter table public.social_profiles enable row level security;
revoke all on public.social_profiles from public, anon, authenticated;

-- Backfill existing profiles so every existing user has a valid unique username
insert into public.social_profiles (user_id, username, created_at, updated_at)
select p.id, harada_private.generate_default_username(p.display_name, p.id), p.created_at, p.updated_at
from public.profiles p
on conflict (user_id) do nothing;

-- Automatically create social_profiles row whenever a profile is inserted
create function public.handle_new_social_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.social_profiles (user_id, username, created_at, updated_at)
  values (new.id, harada_private.generate_default_username(new.display_name, new.id), new.created_at, new.updated_at)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_social_profile() from public, anon, authenticated;

create trigger on_profile_created_social
  after insert on public.profiles
  for each row execute function public.handle_new_social_profile();

-- ---------------------------------------------------------------------------
-- 2. Goal visibility (defaults to private; opt-in public)
-- ---------------------------------------------------------------------------
create table public.goal_visibility (
  goal_id uuid primary key references public.goals (id) on delete cascade,
  visibility text not null default 'private',
  updated_at timestamptz not null default now(),
  constraint goal_visibility_check check (visibility in ('private', 'public'))
);

create index goal_visibility_public_idx on public.goal_visibility (goal_id) where (visibility = 'public');

alter table public.goal_visibility enable row level security;
revoke all on public.goal_visibility from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Follow & Block relationships
-- ---------------------------------------------------------------------------
create table public.social_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint social_follows_not_self_check check (follower_id <> following_id)
);

create index social_follows_following_idx on public.social_follows (following_id, created_at desc);
create index social_follows_follower_idx on public.social_follows (follower_id, created_at desc);

alter table public.social_follows enable row level security;
revoke all on public.social_follows from public, anon, authenticated;

create table public.social_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint social_blocks_not_self_check check (blocker_id <> blocked_id)
);

create index social_blocks_blocked_idx on public.social_blocks (blocked_id);

alter table public.social_blocks enable row level security;
revoke all on public.social_blocks from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Social posts (achievements, milestones, progress updates)
-- ---------------------------------------------------------------------------
create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid references public.goals (id) on delete set null,
  type text not null,
  visibility text not null default 'public',
  headline text not null default '',
  body text not null default '',
  image_url text,
  stats jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_posts_type_check check (
    type in ('goal_completed', 'milestone', 'progress_update', 'general_achievement', 'goal_started')
  ),
  constraint social_posts_visibility_check check (visibility in ('public', 'private')),
  constraint social_posts_headline_len_check check (char_length(headline) <= 160),
  constraint social_posts_body_len_check check (char_length(body) <= 2000),
  constraint social_posts_content_nonempty_check check (
    char_length(btrim(headline)) > 0 or char_length(btrim(body)) > 0
  ),
  -- Same JPEG-only rule as avatars. Served only through get_post_image(), which applies can_view_post().
  constraint social_posts_image_check check (
    image_url is null or (
      char_length(image_url) <= 700000 and image_url ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]+={0,2}$'
    )
  ),
  constraint social_posts_stats_check check (
    stats is null or (jsonb_typeof(stats) = 'object' and char_length(stats::text) <= 2000)
  )
);

create index social_posts_author_created_idx on public.social_posts (author_id, created_at desc, id desc);
create index social_posts_public_created_idx on public.social_posts (created_at desc, id desc) where (visibility = 'public');
create index social_posts_goal_idx on public.social_posts (goal_id);

alter table public.social_posts enable row level security;
revoke all on public.social_posts from public, anon, authenticated;

-- When a goal is deleted, scrub goal metadata and make linked posts private so deleted goals never leak
create function public.handle_goal_deleted_social_posts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.social_posts
  set
    goal_id = null,
    stats = null,
    visibility = 'private',
    headline = case
      when headline = 'Completed goal: ' || left(old.title, 130) then 'Completed a goal'
      when headline = 'Started goal: ' || left(old.title, 130) then 'Started a goal'
      else headline
    end,
    updated_at = now()
  where goal_id = old.id;
  return old;
end;
$$;

revoke all on function public.handle_goal_deleted_social_posts() from public, anon, authenticated;

create trigger on_goal_deleted_scrub_social_posts
  before delete on public.goals
  for each row execute function public.handle_goal_deleted_social_posts();

-- ---------------------------------------------------------------------------
-- 5. Likes, Comments, Hidden posts, and Abuse reports
-- ---------------------------------------------------------------------------
create table public.social_likes (
  post_id uuid not null references public.social_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index social_likes_user_idx on public.social_likes (user_id, created_at desc);

alter table public.social_likes enable row level security;
revoke all on public.social_likes from public, anon, authenticated;

create table public.social_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint social_comments_body_len_check check (char_length(btrim(body)) between 1 and 500)
);

create index social_comments_post_created_idx on public.social_comments (post_id, created_at asc, id asc);

alter table public.social_comments enable row level security;
revoke all on public.social_comments from public, anon, authenticated;

create table public.social_hidden_posts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.social_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.social_hidden_posts enable row level security;
revoke all on public.social_hidden_posts from public, anon, authenticated;

create table public.social_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.social_posts (id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint social_reports_reason_len_check check (char_length(reason) <= 500),
  constraint social_reports_unique_per_user unique (reporter_id, post_id)
);

alter table public.social_reports enable row level security;
revoke all on public.social_reports from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. In-App Notifications & Rate Limiting
-- ---------------------------------------------------------------------------
create table public.social_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  post_id uuid references public.social_posts (id) on delete cascade,
  comment_id uuid references public.social_comments (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint social_notifications_kind_check check (
    kind in ('new_follower', 'post_liked', 'post_commented', 'followed_milestone')
  ),
  constraint social_notifications_not_self_check check (recipient_id <> actor_id)
);

create index social_notifications_recipient_idx on public.social_notifications (recipient_id, created_at desc);
-- Deduplicate repeated follow or like retries
create unique index social_notifications_follow_dedup_idx
  on public.social_notifications (recipient_id, actor_id, kind)
  where (kind = 'new_follower');
create unique index social_notifications_like_dedup_idx
  on public.social_notifications (recipient_id, actor_id, post_id, kind)
  where (kind = 'post_liked');

alter table public.social_notifications enable row level security;
revoke all on public.social_notifications from public, anon, authenticated;

create table public.social_rate_limits (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  action_key text not null,
  occurred_at timestamptz not null default now()
);

create index social_rate_limits_lookup_idx on public.social_rate_limits (user_id, action_key, occurred_at desc);

alter table public.social_rate_limits enable row level security;
revoke all on public.social_rate_limits from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Internal helpers in harada_private
-- ---------------------------------------------------------------------------
create function harada_private.check_social_rate_limit(
  p_uid uuid,
  p_action text,
  p_limit int,
  p_window interval
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  delete from public.social_rate_limits
  where user_id = p_uid and action_key = p_action and occurred_at < now() - p_window;

  select count(*)::int into v_count
  from public.social_rate_limits
  where user_id = p_uid and action_key = p_action and occurred_at >= now() - p_window;

  if v_count >= p_limit then
    perform harada_private.fail('LIMIT_REACHED', 'Too many requests. Please wait a moment and try again.');
  end if;

  insert into public.social_rate_limits (user_id, action_key) values (p_uid, p_action);
end;
$$;

create function harada_private.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.social_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

create function harada_private.is_goal_public(p_goal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.goals g
    join public.goal_visibility gv on gv.goal_id = g.id
    where g.id = p_goal_id
      and gv.visibility = 'public'
      and g.status <> 'archived'
  );
$$;

/**
 * True when viewer `p_viewer` is allowed to see post `p_post_id`.
 * A post is visible to its author, or to another non-blocked user when:
 *  - the author's profile is not private (`is_private = false`)
 *  - the post itself has `visibility = 'public'`
 *  - if the post is linked to a goal (`goal_id is not null`), that goal STILL exists and is currently `'public'`.
 *    (Wait: what if the goal was deleted? If the goal was deleted, `on_goal_deleted_scrub_social_posts` sets
 *     `goal_id = null` and `stats = null`, so the post no longer exposes any goal fields!)
 */
create function harada_private.can_view_post(p_viewer uuid, p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.social_posts sp
    join public.social_profiles prof on prof.user_id = sp.author_id
    where sp.id = p_post_id
      and (
        sp.author_id = p_viewer
        or (
          not harada_private.is_blocked_between(p_viewer, sp.author_id)
          and not prof.is_private
          and sp.visibility = 'public'
          and (sp.goal_id is null or harada_private.is_goal_public(sp.goal_id))
        )
      )
  );
$$;

/** Builds a hydrated JSON object for a single post, respecting viewer permissions and goal privacy. */
create function harada_private.hydrate_post(p_viewer uuid, p_post_id uuid, p_view_as_public boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sp public.social_posts;
  v_author_name text;
  v_username text;
  v_avatar text;
  v_goal jsonb := null;
  v_stats jsonb := null;
  v_goal_public boolean := false;
  v_comments jsonb;
begin
  select * into sp from public.social_posts where id = p_post_id;
  if not found then return null; end if;

  select p.display_name, s.username, s.avatar_url
  into v_author_name, v_username, v_avatar
  from public.profiles p
  join public.social_profiles s on s.user_id = p.id
  where p.id = sp.author_id;

  if sp.goal_id is not null then
    v_goal_public := harada_private.is_goal_public(sp.goal_id);
    if v_goal_public or (sp.author_id = p_viewer and not p_view_as_public) then
      select jsonb_build_object(
        'id', g.id,
        'title', g.title,
        'status', g.status,
        'achievedAt', g.achieved_at,
        'visibility', coalesce(gv.visibility, 'private')
      )
      into v_goal
      from public.goals g
      left join public.goal_visibility gv on gv.goal_id = g.id
      where g.id = sp.goal_id;
      v_stats := sp.stats;
    end if;
  else
    v_stats := sp.stats;
  end if;

  select coalesce(jsonb_agg(c_obj order by c_created asc, c_id asc), '[]'::jsonb)
  into v_comments
  from (
    select
      c.id as c_id,
      c.created_at as c_created,
      jsonb_build_object(
        'id', c.id,
        'postId', c.post_id,
        'body', c.body,
        'createdAt', c.created_at,
        'canDelete', (c.author_id = p_viewer or sp.author_id = p_viewer),
        'author', jsonb_build_object(
          'userId', c.author_id,
          'username', cp.username,
          'displayName', pr.display_name,
          'avatarUrl', cp.avatar_url
        )
      ) as c_obj
    from public.social_comments c
    join public.profiles pr on pr.id = c.author_id
    join public.social_profiles cp on cp.user_id = c.author_id
    where c.post_id = sp.id
      and not harada_private.is_blocked_between(p_viewer, c.author_id)
    order by c.created_at desc, c.id desc
    limit 3
  ) recent;

  return jsonb_build_object(
    'id', sp.id,
    'type', sp.type,
    'visibility', sp.visibility,
    'headline', sp.headline,
    'body', sp.body,
    'hasImage', sp.image_url is not null,
    'stats', v_stats,
    'goal', v_goal,
    'createdAt', sp.created_at,
    'updatedAt', sp.updated_at,
    'isOwnPost', (sp.author_id = p_viewer),
    'author', jsonb_build_object(
      'userId', sp.author_id,
      'username', v_username,
      'displayName', v_author_name,
      'avatarUrl', v_avatar
    ),
    'likeCount', (select count(*)::int from public.social_likes l where l.post_id = sp.id),
    'commentCount', (
      select count(*)::int from public.social_comments c
      where c.post_id = sp.id and not harada_private.is_blocked_between(p_viewer, c.author_id)
    ),
    'likedByViewer', exists (
      select 1 from public.social_likes l where l.post_id = sp.id and l.user_id = p_viewer
    ),
    'recentComments', v_comments
  );
end;
$$;

revoke all on function
  harada_private.check_social_rate_limit(uuid, text, int, interval),
  harada_private.is_blocked_between(uuid, uuid),
  harada_private.is_goal_public(uuid),
  harada_private.can_view_post(uuid, uuid),
  harada_private.hydrate_post(uuid, uuid, boolean)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Public RPCs for Profiles & Goal Visibility
-- ---------------------------------------------------------------------------

/**
 * Returns a user's social profile:
 *   p_input: { userId?: uuid, username?: string, viewAsPublic?: boolean }
 * Never exposes email, billing, or private goals to other users.
 */
create function public.get_social_profile(p_input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_target uuid;
  v_username_arg text;
  v_view_as_public boolean := coalesce((p_input -> 'viewAsPublic') = 'true'::jsonb, false);
  v_prof public.profiles;
  v_soc public.social_profiles;
  v_is_own boolean;
  v_effective_own boolean;
  v_restricted boolean;
  v_public_goals jsonb := '[]'::jsonb;
  v_own_goals jsonb := '[]'::jsonb;
  v_posts jsonb := '[]'::jsonb;
  v_stats jsonb := null;
begin
  if v_viewer is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform harada_private.fail('VALIDATION', 'Invalid input');
  end if;

  if harada_private.has(p_input, 'userId') then
    v_target := harada_private.req_uuid(p_input, 'userId');
  elsif harada_private.has(p_input, 'username') then
    v_username_arg := lower(harada_private.txt(p_input, 'username', 30, true));
    select s.user_id into v_target from public.social_profiles s where lower(s.username) = v_username_arg;
    if v_target is null then perform harada_private.fail('NOT_FOUND', 'Profile not found'); end if;
  else
    v_target := v_viewer;
  end if;

  if v_target <> v_viewer and harada_private.is_blocked_between(v_viewer, v_target) then
    perform harada_private.fail('NOT_FOUND', 'Profile not found');
  end if;

  select * into v_prof from public.profiles where id = v_target;
  if not found then perform harada_private.fail('NOT_FOUND', 'Profile not found'); end if;

  select * into v_soc from public.social_profiles where user_id = v_target;
  if not found then perform harada_private.fail('NOT_FOUND', 'Profile not found'); end if;

  v_is_own := (v_target = v_viewer);
  v_effective_own := v_is_own and not v_view_as_public;
  v_restricted := v_soc.is_private and not v_effective_own;

  if not v_restricted then
    -- Public stats are computed strictly from public goals and public posts so private goals never leak in counts.
    v_stats := jsonb_build_object(
      'goalsCompleted', (
        select count(*)::int from public.goals g
        join public.goal_visibility gv on gv.goal_id = g.id
        where g.owner_id = v_target and gv.visibility = 'public' and g.status = 'achieved'
      ),
      'activePublicGoals', (
        select count(*)::int from public.goals g
        join public.goal_visibility gv on gv.goal_id = g.id
        where g.owner_id = v_target and gv.visibility = 'public' and g.status = 'active'
      ),
      'tasksCompleted', (
        select count(*)::int from public.actions a
        join public.goals g on g.id = a.goal_id
        join public.goal_visibility gv on gv.goal_id = g.id
        where g.owner_id = v_target and gv.visibility = 'public' and g.status <> 'archived'
          and a.kind = 'task' and a.archived_at is null and a.completed_at is not null
      ),
      'postsCount', (
        select count(*)::int from public.social_posts sp
        where sp.author_id = v_target
          and sp.visibility = 'public'
          and (sp.goal_id is null or harada_private.is_goal_public(sp.goal_id))
      )
    );

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'title', g.title,
        'status', g.status,
        'targetDate', g.target_date,
        'activatedOn', g.activated_on,
        'achievedAt', g.achieved_at,
        'outcomeCount', (select count(*)::int from public.outcomes o where o.goal_id = g.id and o.archived_at is null),
        'actionCount', (select count(*)::int from public.actions a where a.goal_id = g.id and a.archived_at is null),
        'completedTasks', (
          select count(*)::int from public.actions a
          where a.goal_id = g.id and a.kind = 'task' and a.archived_at is null and a.completed_at is not null
        ),
        'totalTasks', (
          select count(*)::int from public.actions a
          where a.goal_id = g.id and a.kind = 'task' and a.archived_at is null
        )
      ) order by g.updated_at desc
    ), '[]'::jsonb)
    into v_public_goals
    from public.goals g
    join public.goal_visibility gv on gv.goal_id = g.id
    where g.owner_id = v_target
      and gv.visibility = 'public'
      and g.status in ('active', 'achieved');

    select coalesce(jsonb_agg(harada_private.hydrate_post(v_viewer, sp.id, v_view_as_public) order by sp.created_at desc, sp.id desc), '[]'::jsonb)
    into v_posts
    from (
      select s.id, s.created_at
      from public.social_posts s
      where s.author_id = v_target
        and (
          v_effective_own
          or (s.visibility = 'public' and (s.goal_id is null or harada_private.is_goal_public(s.goal_id)))
        )
      order by s.created_at desc, s.id desc
      limit 20
    ) sp;
  end if;

  if v_is_own then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'title', g.title,
        'status', g.status,
        'visibility', coalesce(gv.visibility, 'private'),
        'achievedAt', g.achieved_at,
        'completedTasks', (
          select count(*)::int from public.actions a
          where a.goal_id = g.id and a.kind = 'task' and a.archived_at is null and a.completed_at is not null
        ),
        'totalTasks', (
          select count(*)::int from public.actions a
          where a.goal_id = g.id and a.kind = 'task' and a.archived_at is null
        )
      ) order by g.updated_at desc
    ), '[]'::jsonb)
    into v_own_goals
    from public.goals g
    left join public.goal_visibility gv on gv.goal_id = g.id
    where g.owner_id = v_viewer and g.status <> 'archived';
  end if;

  return jsonb_build_object(
    'userId', v_prof.id,
    'username', v_soc.username,
    'displayName', v_prof.display_name,
    'bio', case when v_restricted then '' else v_soc.bio end,
    'location', case when v_restricted then '' else v_soc.location end,
    'website', case when v_restricted then '' else v_soc.website end,
    'avatarUrl', v_soc.avatar_url,
    'isPrivate', v_soc.is_private,
    'restricted', v_restricted,
    'joinedAt', v_prof.created_at,
    'isOwnProfile', v_is_own,
    'isFollowing', exists (
      select 1 from public.social_follows f where f.follower_id = v_viewer and f.following_id = v_target
    ),
    'followsViewer', exists (
      select 1 from public.social_follows f where f.follower_id = v_target and f.following_id = v_viewer
    ),
    'followersCount', (select count(*)::int from public.social_follows f where f.following_id = v_target),
    'followingCount', (select count(*)::int from public.social_follows f where f.follower_id = v_target),
    'stats', v_stats,
    'publicGoals', v_public_goals,
    'ownGoals', v_own_goals,
    'recentPosts', v_posts
  );
end;
$$;

/**
 * Updates the caller's social profile:
 *   { displayName?, username?, bio?, location?, website?, avatarUrl?, isPrivate? }
 */
create function public.update_social_profile(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_display_name text;
  v_username text;
  v_bio text;
  v_location text;
  v_website text;
  v_avatar text;
  v_has_avatar boolean := false;
  v_is_private boolean;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform harada_private.fail('VALIDATION', 'Invalid input');
  end if;

  perform harada_private.check_social_rate_limit(v_uid, 'update_profile', 30, interval '15 minutes');

  if harada_private.has(p_input, 'displayName') then
    v_display_name := harada_private.txt(p_input, 'displayName', 80, true);
  end if;

  if harada_private.has(p_input, 'username') then
    v_username := lower(harada_private.txt(p_input, 'username', 30, true));
    if v_username !~ '^[a-z0-9_]{3,30}$' then
      perform harada_private.fail(
        'VALIDATION',
        'Use 3 to 30 lowercase letters, numbers, or underscores',
        'username'
      );
    end if;
    if v_username = any (array[
      'admin', 'settings', 'today', 'goal', 'matrix', 'review', 'community',
      'signin', 'signup', 'pricing', 'challenge', 'api', 'account', 'share', 's', 'u', 'new', 'edit', 'me'
    ]) then
      perform harada_private.fail('VALIDATION', 'That username is reserved', 'username');
    end if;
    if exists (
      select 1 from public.social_profiles s
      where lower(s.username) = v_username and s.user_id <> v_uid
    ) then
      perform harada_private.fail('CONFLICT', 'That username is already taken', 'username');
    end if;
  end if;

  if p_input ? 'bio' then
    v_bio := coalesce(harada_private.txt(p_input, 'bio', 280, false), '');
  end if;

  if p_input ? 'location' then
    v_location := coalesce(harada_private.txt(p_input, 'location', 80, false), '');
  end if;

  if p_input ? 'website' then
    v_website := coalesce(harada_private.txt(p_input, 'website', 200, false), '');
    if v_website <> '' and v_website !~ '^https?://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/.*)?$' then
      perform harada_private.fail('VALIDATION', 'Enter a valid http:// or https:// website URL', 'website');
    end if;
  end if;

  if p_input ? 'avatarUrl' then
    v_has_avatar := true;
    if jsonb_typeof(p_input -> 'avatarUrl') = 'null' or btrim(coalesce(p_input ->> 'avatarUrl', '')) = '' then
      v_avatar := null;
    else
      if jsonb_typeof(p_input -> 'avatarUrl') <> 'string' then
        perform harada_private.fail('VALIDATION', 'Invalid image format', 'avatarUrl');
      end if;
      v_avatar := btrim(p_input ->> 'avatarUrl');
      if char_length(v_avatar) > 60000 then
        perform harada_private.fail('VALIDATION', 'Profile picture is too large', 'avatarUrl');
      end if;
      if v_avatar !~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]+={0,2}$' then
        perform harada_private.fail('VALIDATION', 'Use a photo (JPEG)', 'avatarUrl');
      end if;
    end if;
  end if;

  if harada_private.has(p_input, 'isPrivate') then
    if jsonb_typeof(p_input -> 'isPrivate') <> 'boolean' then
      perform harada_private.fail('VALIDATION', 'Invalid privacy setting', 'isPrivate');
    end if;
    v_is_private := (p_input -> 'isPrivate') = 'true'::jsonb;
  end if;

  if v_display_name is not null then
    update public.profiles
    set display_name = v_display_name, updated_at = harada_private.now_ms()
    where id = v_uid;
  end if;

  update public.social_profiles
  set
    username = coalesce(v_username, username),
    bio = coalesce(v_bio, bio),
    location = coalesce(v_location, location),
    website = coalesce(v_website, website),
    avatar_url = case when v_has_avatar then v_avatar else avatar_url end,
    is_private = coalesce(v_is_private, is_private),
    updated_at = harada_private.now_ms()
  where user_id = v_uid;

  return public.get_social_profile(jsonb_build_object('userId', v_uid));
exception
  when unique_violation then
    perform harada_private.fail('CONFLICT', 'That username is already taken', 'username');
    return null;
end;
$$;

/**
 * Sets a goal's visibility ('private' | 'public'). Only the goal's owner can call this.
 */
create function public.set_goal_visibility(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_goal_id uuid;
  v_vis text;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform harada_private.fail('VALIDATION', 'Invalid input');
  end if;
  v_goal_id := harada_private.req_uuid(p_input, 'goalId');
  v_vis := harada_private.txt(p_input, 'visibility', 16, true);
  if v_vis not in ('private', 'public') then
    perform harada_private.fail('VALIDATION', 'Choose private or public', 'visibility');
  end if;

  if not exists (select 1 from public.goals g where g.id = v_goal_id and g.owner_id = v_uid) then
    perform harada_private.fail('NOT_FOUND', 'Goal not found');
  end if;

  insert into public.goal_visibility (goal_id, visibility, updated_at)
  values (v_goal_id, v_vis, harada_private.now_ms())
  on conflict (goal_id) do update
  set visibility = excluded.visibility, updated_at = excluded.updated_at;

  return jsonb_build_object('goalId', v_goal_id, 'visibility', v_vis);
end;
$$;

/**
 * Returns the visibility ('private' | 'public') for one or all of the caller's goals.
 */
create function public.get_goal_visibility(p_input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_goal_id uuid;
  v_vis text;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is not null and jsonb_typeof(p_input) = 'object' and harada_private.has(p_input, 'goalId') then
    v_goal_id := harada_private.req_uuid(p_input, 'goalId');
    if not exists (select 1 from public.goals g where g.id = v_goal_id and g.owner_id = v_uid) then
      perform harada_private.fail('NOT_FOUND', 'Goal not found');
    end if;
    select coalesce(gv.visibility, 'private') into v_vis
    from public.goals g
    left join public.goal_visibility gv on gv.goal_id = g.id
    where g.id = v_goal_id and g.owner_id = v_uid;
    return jsonb_build_object('goalId', v_goal_id, 'visibility', coalesce(v_vis, 'private'));
  end if;

  return coalesce(
    (
      select jsonb_object_agg(g.id::text, coalesce(gv.visibility, 'private'))
      from public.goals g
      left join public.goal_visibility gv on gv.goal_id = g.id
      where g.owner_id = v_uid
    ),
    '{}'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Following, Blocking & Discovery RPCs
-- ---------------------------------------------------------------------------

create function public.follow_user(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_soc public.social_profiles;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  v_target := harada_private.req_uuid(p_input, 'targetUserId');
  if v_target = v_uid then
    perform harada_private.fail('VALIDATION', 'You cannot follow yourself', 'targetUserId');
  end if;

  perform harada_private.check_social_rate_limit(v_uid, 'follow', 60, interval '15 minutes');

  if harada_private.is_blocked_between(v_uid, v_target) then
    perform harada_private.fail('NOT_FOUND', 'User not found');
  end if;

  select * into v_soc from public.social_profiles where user_id = v_target;
  if not found then perform harada_private.fail('NOT_FOUND', 'User not found'); end if;
  if v_soc.is_private then
    perform harada_private.fail('INVALID_STATE', 'This profile is private');
  end if;

  insert into public.social_follows (follower_id, following_id)
  values (v_uid, v_target)
  on conflict (follower_id, following_id) do nothing;

  insert into public.social_notifications (recipient_id, actor_id, kind)
  values (v_target, v_uid, 'new_follower')
  on conflict do nothing;

  return jsonb_build_object(
    'following', true,
    'followersCount', (select count(*)::int from public.social_follows f where f.following_id = v_target),
    'followingCount', (select count(*)::int from public.social_follows f where f.follower_id = v_uid)
  );
end;
$$;

create function public.unfollow_user(p_input jsonb)
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
  v_target := harada_private.req_uuid(p_input, 'targetUserId');
  if v_target = v_uid then
    perform harada_private.fail('VALIDATION', 'Invalid target user', 'targetUserId');
  end if;

  delete from public.social_follows
  where follower_id = v_uid and following_id = v_target;

  return jsonb_build_object(
    'following', false,
    'followersCount', (select count(*)::int from public.social_follows f where f.following_id = v_target),
    'followingCount', (select count(*)::int from public.social_follows f where f.follower_id = v_uid)
  );
end;
$$;

create function public.block_user(p_input jsonb)
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
  v_target := harada_private.req_uuid(p_input, 'targetUserId');
  if v_target = v_uid then
    perform harada_private.fail('VALIDATION', 'You cannot block yourself', 'targetUserId');
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_target) then
    perform harada_private.fail('NOT_FOUND', 'User not found');
  end if;

  insert into public.social_blocks (blocker_id, blocked_id)
  values (v_uid, v_target)
  on conflict (blocker_id, blocked_id) do nothing;

  delete from public.social_follows
  where (follower_id = v_uid and following_id = v_target)
     or (follower_id = v_target and following_id = v_uid);

  return jsonb_build_object('blocked', true, 'targetUserId', v_target);
end;
$$;

create function public.unblock_user(p_input jsonb)
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
  v_target := harada_private.req_uuid(p_input, 'targetUserId');
  delete from public.social_blocks where blocker_id = v_uid and blocked_id = v_target;
  return jsonb_build_object('blocked', false, 'targetUserId', v_target);
end;
$$;

create function public.list_follow_connections(p_input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_target uuid;
  v_kind text;
  v_limit int := 50;
  v_soc public.social_profiles;
  v_items jsonb;
begin
  if v_viewer is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform harada_private.fail('VALIDATION', 'Invalid input');
  end if;

  v_kind := harada_private.txt(p_input, 'kind', 16, true);
  if v_kind not in ('followers', 'following') then
    perform harada_private.fail('VALIDATION', 'Choose followers or following', 'kind');
  end if;

  if harada_private.has(p_input, 'userId') then
    v_target := harada_private.req_uuid(p_input, 'userId');
  elsif harada_private.has(p_input, 'username') then
    select s.user_id into v_target
    from public.social_profiles s
    where lower(s.username) = lower(harada_private.txt(p_input, 'username', 30, true));
  else
    v_target := v_viewer;
  end if;

  if v_target is null or (v_target <> v_viewer and harada_private.is_blocked_between(v_viewer, v_target)) then
    perform harada_private.fail('NOT_FOUND', 'Profile not found');
  end if;

  select * into v_soc from public.social_profiles where user_id = v_target;
  if not found then perform harada_private.fail('NOT_FOUND', 'Profile not found'); end if;

  if v_soc.is_private and v_target <> v_viewer then
    return jsonb_build_object('items', '[]'::jsonb);
  end if;

  if harada_private.has(p_input, 'limit') then
    v_limit := greatest(1, least(100, (p_input ->> 'limit')::int));
  end if;

  if v_kind = 'followers' then
    select coalesce(jsonb_agg(item_obj order by f_created desc), '[]'::jsonb)
    into v_items
    from (
      select
        f.created_at as f_created,
        jsonb_build_object(
          'userId', p.id,
          'username', s.username,
          'displayName', p.display_name,
          'bio', case when s.is_private and p.id <> v_viewer then '' else s.bio end,
          'avatarUrl', s.avatar_url,
          'isPrivate', s.is_private,
          'isOwnProfile', (p.id = v_viewer),
          'isFollowing', exists (
            select 1 from public.social_follows sf where sf.follower_id = v_viewer and sf.following_id = p.id
          )
        ) as item_obj
      from public.social_follows f
      join public.profiles p on p.id = f.follower_id
      join public.social_profiles s on s.user_id = p.id
      where f.following_id = v_target
        and not harada_private.is_blocked_between(v_viewer, p.id)
      order by f.created_at desc
      limit v_limit
    ) rows_sub;
  else
    select coalesce(jsonb_agg(item_obj order by f_created desc), '[]'::jsonb)
    into v_items
    from (
      select
        f.created_at as f_created,
        jsonb_build_object(
          'userId', p.id,
          'username', s.username,
          'displayName', p.display_name,
          'bio', case when s.is_private and p.id <> v_viewer then '' else s.bio end,
          'avatarUrl', s.avatar_url,
          'isPrivate', s.is_private,
          'isOwnProfile', (p.id = v_viewer),
          'isFollowing', exists (
            select 1 from public.social_follows sf where sf.follower_id = v_viewer and sf.following_id = p.id
          )
        ) as item_obj
      from public.social_follows f
      join public.profiles p on p.id = f.following_id
      join public.social_profiles s on s.user_id = p.id
      where f.follower_id = v_target
        and not harada_private.is_blocked_between(v_viewer, p.id)
      order by f.created_at desc
      limit v_limit
    ) rows_sub;
  end if;

  return jsonb_build_object('items', v_items);
end;
$$;

/**
 * Search and discovery:
 *   { query?: string, limit?: int }
 * Never returns private profiles, private goals, or blocked users.
 */
create function public.discover_users(p_input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_query text := '';
  v_limit int := 20;
  v_users jsonb;
  v_achievements jsonb;
begin
  if v_viewer is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is not null and jsonb_typeof(p_input) = 'object' then
    if harada_private.has(p_input, 'query') then
      v_query := lower(coalesce(harada_private.txt(p_input, 'query', 60, false), ''));
      v_query := regexp_replace(v_query, '^@+', '', 'g');
    end if;
    if harada_private.has(p_input, 'limit') then
      v_limit := greatest(1, least(50, (p_input ->> 'limit')::int));
    end if;
  end if;

  if v_query <> '' then
    select coalesce(jsonb_agg(u_obj order by exact_match desc, followers_cnt desc, u_username asc), '[]'::jsonb)
    into v_users
    from (
      select
        s.username as u_username,
        (s.username = v_query or lower(p.display_name) = v_query) as exact_match,
        (select count(*)::int from public.social_follows f where f.following_id = p.id) as followers_cnt,
        jsonb_build_object(
          'userId', p.id,
          'username', s.username,
          'displayName', p.display_name,
          'bio', s.bio,
          'avatarUrl', s.avatar_url,
          'isOwnProfile', (p.id = v_viewer),
          'isFollowing', exists (
            select 1 from public.social_follows f where f.follower_id = v_viewer and f.following_id = p.id
          ),
          'followersCount', (select count(*)::int from public.social_follows f where f.following_id = p.id),
          'publicGoalTitle', (
            select g.title from public.goals g
            join public.goal_visibility gv on gv.goal_id = g.id
            where g.owner_id = p.id and gv.visibility = 'public' and g.status in ('active', 'achieved')
            order by g.updated_at desc limit 1
          ),
          'reason', case
            when exists (
              select 1 from public.social_posts sp
              where sp.author_id = p.id and sp.visibility = 'public'
                and sp.type in ('goal_completed', 'milestone')
            ) then 'Recent public achievement'
            when exists (
              select 1 from public.goals g
              join public.goal_visibility gv on gv.goal_id = g.id
              where g.owner_id = p.id and gv.visibility = 'public' and g.status = 'active'
            ) then 'Working on a public goal'
            else 'Community member'
          end
        ) as u_obj
      from public.social_profiles s
      join public.profiles p on p.id = s.user_id
      where not s.is_private
        and not harada_private.is_blocked_between(v_viewer, p.id)
        and (
          s.username ilike '%' || v_query || '%'
          or lower(p.display_name) ilike '%' || v_query || '%'
        )
      order by (s.username = v_query) desc, s.created_at desc
      limit v_limit
    ) search_rows;
  else
    select coalesce(jsonb_agg(u_obj order by has_posts desc, has_public_goal desc, followers_cnt desc, u_created desc), '[]'::jsonb)
    into v_users
    from (
      select
        s.created_at as u_created,
        exists (
          select 1 from public.social_posts sp
          where sp.author_id = p.id and sp.visibility = 'public'
            and (sp.goal_id is null or harada_private.is_goal_public(sp.goal_id))
        ) as has_posts,
        exists (
          select 1 from public.goals g
          join public.goal_visibility gv on gv.goal_id = g.id
          where g.owner_id = p.id and gv.visibility = 'public' and g.status in ('active', 'achieved')
        ) as has_public_goal,
        (select count(*)::int from public.social_follows f where f.following_id = p.id) as followers_cnt,
        jsonb_build_object(
          'userId', p.id,
          'username', s.username,
          'displayName', p.display_name,
          'bio', s.bio,
          'avatarUrl', s.avatar_url,
          'isOwnProfile', false,
          'isFollowing', exists (
            select 1 from public.social_follows f where f.follower_id = v_viewer and f.following_id = p.id
          ),
          'followersCount', (select count(*)::int from public.social_follows f where f.following_id = p.id),
          'publicGoalTitle', (
            select g.title from public.goals g
            join public.goal_visibility gv on gv.goal_id = g.id
            where g.owner_id = p.id and gv.visibility = 'public' and g.status in ('active', 'achieved')
            order by g.updated_at desc limit 1
          ),
          'reason', case
            when exists (
              select 1 from public.social_posts sp
              where sp.author_id = p.id and sp.visibility = 'public'
                and sp.type in ('goal_completed', 'milestone')
            ) then 'Recent public achievement'
            when exists (
              select 1 from public.goals g
              join public.goal_visibility gv on gv.goal_id = g.id
              where g.owner_id = p.id and gv.visibility = 'public' and g.status = 'active'
            ) then 'Working on a public goal'
            else 'Community member'
          end
        ) as u_obj
      from public.social_profiles s
      join public.profiles p on p.id = s.user_id
      where p.id <> v_viewer
        and not s.is_private
        and not harada_private.is_blocked_between(v_viewer, p.id)
        and not exists (
          select 1 from public.social_follows f where f.follower_id = v_viewer and f.following_id = p.id
        )
      limit v_limit
    ) suggested_rows;
  end if;

  select coalesce(jsonb_agg(harada_private.hydrate_post(v_viewer, sp.id, false) order by sp.created_at desc, sp.id desc), '[]'::jsonb)
  into v_achievements
  from (
    select s.id, s.created_at
    from public.social_posts s
    join public.social_profiles prof on prof.user_id = s.author_id
    where not prof.is_private
      and s.visibility = 'public'
      and s.type in ('goal_completed', 'milestone')
      and (s.goal_id is null or harada_private.is_goal_public(s.goal_id))
      and not harada_private.is_blocked_between(v_viewer, s.author_id)
      and not exists (
        select 1 from public.social_hidden_posts hp where hp.user_id = v_viewer and hp.post_id = s.id
      )
    order by s.created_at desc, s.id desc
    limit 10
  ) sp;

  return jsonb_build_object(
    'users', v_users,
    'recentAchievements', v_achievements
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Social Posts, Feed, Likes, Comments, Reports & Notifications RPCs
-- ---------------------------------------------------------------------------

/**
 * Publishes a social post:
 *   { id?, type, goalId?, visibility?, headline?, body?, imageUrl?, includeStats?, makeGoalPublic? }
 */
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
  v_type text;
  v_vis text := 'public';
  v_goal_id uuid := null;
  v_goal public.goals;
  v_goal_vis text;
  v_make_public boolean := false;
  v_include_stats boolean := true;
  v_headline text := '';
  v_body text := '';
  v_image text := null;
  v_stats jsonb := null;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform harada_private.fail('VALIDATION', 'Invalid input');
  end if;

  v_id := coalesce(harada_private.opt_uuid(p_input, 'id'), gen_random_uuid());
  -- Idempotent replay for the same author
  if exists (select 1 from public.social_posts sp where sp.id = v_id and sp.author_id = v_uid) then
    return harada_private.hydrate_post(v_uid, v_id, false);
  end if;

  perform harada_private.check_social_rate_limit(v_uid, 'create_post', 20, interval '15 minutes');

  v_type := harada_private.txt(p_input, 'type', 32, true);
  if v_type not in ('goal_completed', 'milestone', 'progress_update', 'general_achievement', 'goal_started') then
    perform harada_private.fail('VALIDATION', 'Invalid post type', 'type');
  end if;

  if harada_private.has(p_input, 'visibility') then
    v_vis := harada_private.txt(p_input, 'visibility', 16, true);
    if v_vis not in ('public', 'private') then
      perform harada_private.fail('VALIDATION', 'Choose public or private', 'visibility');
    end if;
  end if;

  v_headline := coalesce(harada_private.txt(p_input, 'headline', 160, false), '');
  v_body := coalesce(harada_private.txt(p_input, 'body', 2000, false), '');

  if harada_private.has(p_input, 'imageUrl') then
    if jsonb_typeof(p_input -> 'imageUrl') <> 'string' then
      perform harada_private.fail('VALIDATION', 'Invalid image format', 'imageUrl');
    end if;
    v_image := btrim(p_input ->> 'imageUrl');
    if v_image = '' then
      v_image := null;
    else
      if char_length(v_image) > 700000 then
        perform harada_private.fail('VALIDATION', 'Photo is too large', 'imageUrl');
      end if;
      if v_image !~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]+={0,2}$' then
        perform harada_private.fail('VALIDATION', 'Use a photo (JPEG)', 'imageUrl');
      end if;
    end if;
  end if;

  if harada_private.has(p_input, 'makeGoalPublic') then
    v_make_public := (p_input -> 'makeGoalPublic') = 'true'::jsonb;
  end if;
  if harada_private.has(p_input, 'includeStats') then
    v_include_stats := (p_input -> 'includeStats') = 'true'::jsonb;
  end if;

  if harada_private.has(p_input, 'goalId') then
    v_goal_id := harada_private.req_uuid(p_input, 'goalId');
    select * into v_goal from public.goals where id = v_goal_id and owner_id = v_uid;
    if not found then perform harada_private.fail('NOT_FOUND', 'Goal not found'); end if;
    if v_goal.status = 'archived' then
      perform harada_private.fail('INVALID_STATE', 'Archived goals cannot be shared');
    end if;

    if v_make_public then
      insert into public.goal_visibility (goal_id, visibility, updated_at)
      values (v_goal.id, 'public', harada_private.now_ms())
      on conflict (goal_id) do update
      set visibility = 'public', updated_at = excluded.updated_at;
      v_goal_vis := 'public';
    else
      select coalesce(gv.visibility, 'private') into v_goal_vis
      from public.goals g
      left join public.goal_visibility gv on gv.goal_id = g.id
      where g.id = v_goal.id;
    end if;

    -- Prevent accidental publication of a private goal in a public post
    if v_vis = 'public' and v_goal_vis <> 'public' then
      perform harada_private.fail(
        'INVALID_STATE',
        'This goal is private. Make the goal public to share it publicly, or post as private.',
        'goalId'
      );
    end if;

    if v_type = 'goal_completed' and v_goal.status <> 'achieved' then
      perform harada_private.fail('INVALID_STATE', 'Mark the goal as achieved before sharing a goal completion', 'goalId');
    end if;

    if v_headline = '' then
      if v_type = 'goal_completed' then
        v_headline := 'Completed goal: ' || left(v_goal.title, 130);
      elsif v_type = 'goal_started' then
        v_headline := 'Started goal: ' || left(v_goal.title, 130);
      end if;
    end if;

    if v_include_stats then
      v_stats := jsonb_build_object(
        'tasksDone', (
          select count(*)::int from public.actions a
          where a.goal_id = v_goal.id and a.kind = 'task' and a.archived_at is null and a.completed_at is not null
        ),
        'tasksTotal', (
          select count(*)::int from public.actions a
          where a.goal_id = v_goal.id and a.kind = 'task' and a.archived_at is null
        ),
        'keyAreas', (
          select count(*)::int from public.outcomes o
          where o.goal_id = v_goal.id and o.archived_at is null
        ),
        'actionsPlanned', (
          select count(*)::int from public.actions a
          where a.goal_id = v_goal.id and a.archived_at is null
        ),
        'routineCount', (
          select count(*)::int from public.actions a
          where a.goal_id = v_goal.id and a.kind = 'routine' and a.archived_at is null
        )
      );
    end if;
  else
    if v_type in ('goal_completed', 'goal_started') then
      perform harada_private.fail('VALIDATION', 'Choose a goal for this post', 'goalId');
    end if;
  end if;

  if v_type in ('milestone', 'general_achievement') and v_headline = '' then
    perform harada_private.fail('VALIDATION', 'Give your achievement a short title', 'headline');
  end if;

  if v_headline = '' and v_body = '' then
    perform harada_private.fail('VALIDATION', 'Write an update or headline before posting', 'body');
  end if;

  insert into public.social_posts (
    id, author_id, goal_id, type, visibility, headline, body, image_url, stats, created_at, updated_at
  )
  values (
    v_id, v_uid, v_goal_id, v_type, v_vis, v_headline, v_body, v_image, v_stats,
    harada_private.now_ms(), harada_private.now_ms()
  );

  -- Notify followers when a user shares a public goal completion or milestone
  if v_vis = 'public' and v_type in ('goal_completed', 'milestone')
     and not coalesce((select s.is_private from public.social_profiles s where s.user_id = v_uid), false) then
    insert into public.social_notifications (recipient_id, actor_id, kind, post_id)
    select f.follower_id, v_uid, 'followed_milestone', v_id
    from public.social_follows f
    where f.following_id = v_uid
      and not harada_private.is_blocked_between(v_uid, f.follower_id)
    limit 200;
  end if;

  return harada_private.hydrate_post(v_uid, v_id, false);
exception
  when unique_violation then
    perform harada_private.fail('CONFLICT', 'This post already exists');
    return null;
end;
$$;

/**
 * Updates an existing post owned by the caller:
 *   { postId, headline?, body?, visibility?, imageUrl? }
 */
create function public.update_social_post(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_post_id uuid;
  sp public.social_posts;
  v_headline text;
  v_body text;
  v_vis text;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  v_post_id := harada_private.req_uuid(p_input, 'postId');
  select * into sp from public.social_posts where id = v_post_id and author_id = v_uid;
  if not found then perform harada_private.fail('NOT_FOUND', 'Post not found'); end if;

  v_headline := case when p_input ? 'headline'
    then coalesce(harada_private.txt(p_input, 'headline', 160, false), '')
    else sp.headline end;
  v_body := case when p_input ? 'body'
    then coalesce(harada_private.txt(p_input, 'body', 2000, false), '')
    else sp.body end;
  v_vis := case when harada_private.has(p_input, 'visibility')
    then harada_private.txt(p_input, 'visibility', 16, true)
    else sp.visibility end;

  if v_vis not in ('public', 'private') then
    perform harada_private.fail('VALIDATION', 'Choose public or private', 'visibility');
  end if;
  if v_headline = '' and v_body = '' then
    perform harada_private.fail('VALIDATION', 'Write an update or headline', 'body');
  end if;
  if v_vis = 'public' and sp.goal_id is not null and not harada_private.is_goal_public(sp.goal_id) then
    perform harada_private.fail(
      'INVALID_STATE',
      'The linked goal is private. Make the goal public before making this post public.',
      'visibility'
    );
  end if;

  update public.social_posts
  set headline = v_headline, body = v_body, visibility = v_vis, updated_at = harada_private.now_ms()
  where id = v_post_id and author_id = v_uid;

  return harada_private.hydrate_post(v_uid, v_post_id, false);
end;
$$;

/**
 * Deletes a post owned by the caller without deleting its associated goal.
 */
create function public.delete_social_post(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_post_id uuid;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  v_post_id := harada_private.req_uuid(p_input, 'postId');
  delete from public.social_posts where id = v_post_id and author_id = v_uid;
  if not found then perform harada_private.fail('NOT_FOUND', 'Post not found'); end if;
  return jsonb_build_object('deleted', true, 'postId', v_post_id);
end;
$$;

/**
 * Chronological, cursor-paginated feed:
 *   { scope?: 'following' | 'explore' | 'profile', userId?: uuid, username?: string, viewAsPublic?: boolean,
 *     limit?: int, before?: timestamptz, beforeId?: uuid }
 */
create function public.get_social_feed(p_input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_scope text := 'following';
  v_target uuid := null;
  v_view_as_public boolean := false;
  v_limit int := 15;
  v_before timestamptz := null;
  v_before_id uuid := null;
  v_rows uuid[];
  v_items jsonb := '[]'::jsonb;
  v_next jsonb := null;
  v_last_id uuid;
  v_last_ts timestamptz;
begin
  if v_viewer is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is not null and jsonb_typeof(p_input) = 'object' then
    if harada_private.has(p_input, 'scope') then
      v_scope := harada_private.txt(p_input, 'scope', 16, true);
    end if;
    if v_scope not in ('following', 'explore', 'profile') then
      perform harada_private.fail('VALIDATION', 'Invalid feed scope', 'scope');
    end if;
    if harada_private.has(p_input, 'limit') then
      v_limit := greatest(1, least(50, (p_input ->> 'limit')::int));
    end if;
    if harada_private.has(p_input, 'before') then
      begin
        v_before := (p_input ->> 'before')::timestamptz;
      exception when others then
        perform harada_private.fail('VALIDATION', 'Invalid cursor timestamp', 'before');
      end;
    end if;
    if harada_private.has(p_input, 'beforeId') then
      v_before_id := harada_private.opt_uuid(p_input, 'beforeId');
    end if;
    v_view_as_public := coalesce((p_input -> 'viewAsPublic') = 'true'::jsonb, false);
  end if;

  if v_scope = 'profile' then
    if harada_private.has(p_input, 'userId') then
      v_target := harada_private.req_uuid(p_input, 'userId');
    elsif harada_private.has(p_input, 'username') then
      select s.user_id into v_target
      from public.social_profiles s
      where lower(s.username) = lower(harada_private.txt(p_input, 'username', 30, true));
    else
      v_target := v_viewer;
    end if;
    if v_target is null or (v_target <> v_viewer and harada_private.is_blocked_between(v_viewer, v_target)) then
      perform harada_private.fail('NOT_FOUND', 'Profile not found');
    end if;
    if (select s.is_private from public.social_profiles s where s.user_id = v_target)
       and not (v_target = v_viewer and not v_view_as_public) then
      return jsonb_build_object('items', '[]'::jsonb, 'nextCursor', null, 'followingCount', 0);
    end if;

    select array_agg(sp.id order by sp.created_at desc, sp.id desc)
    into v_rows
    from (
      select s.id, s.created_at
      from public.social_posts s
      where s.author_id = v_target
        and (
          (v_target = v_viewer and not v_view_as_public)
          or (s.visibility = 'public' and (s.goal_id is null or harada_private.is_goal_public(s.goal_id)))
        )
        and (
          v_before is null
          or s.created_at < v_before
          or (s.created_at = v_before and (v_before_id is null or s.id < v_before_id))
        )
      order by s.created_at desc, s.id desc
      limit v_limit + 1
    ) sp;
  elsif v_scope = 'explore' then
    select array_agg(sp.id order by sp.created_at desc, sp.id desc)
    into v_rows
    from (
      select s.id, s.created_at
      from public.social_posts s
      join public.social_profiles prof on prof.user_id = s.author_id
      where not prof.is_private
        and s.visibility = 'public'
        and (s.goal_id is null or harada_private.is_goal_public(s.goal_id))
        and not harada_private.is_blocked_between(v_viewer, s.author_id)
        and not exists (
          select 1 from public.social_hidden_posts hp where hp.user_id = v_viewer and hp.post_id = s.id
        )
        and (
          v_before is null
          or s.created_at < v_before
          or (s.created_at = v_before and (v_before_id is null or s.id < v_before_id))
        )
      order by s.created_at desc, s.id desc
      limit v_limit + 1
    ) sp;
  else
    -- 'following': posts from followed public users + caller's own public posts
    select array_agg(sp.id order by sp.created_at desc, sp.id desc)
    into v_rows
    from (
      select s.id, s.created_at
      from public.social_posts s
      join public.social_profiles prof on prof.user_id = s.author_id
      where (
          s.author_id = v_viewer
          or (
            not prof.is_private
            and exists (
              select 1 from public.social_follows f
              where f.follower_id = v_viewer and f.following_id = s.author_id
            )
          )
        )
        and s.visibility = 'public'
        and (s.goal_id is null or harada_private.is_goal_public(s.goal_id))
        and not harada_private.is_blocked_between(v_viewer, s.author_id)
        and not exists (
          select 1 from public.social_hidden_posts hp where hp.user_id = v_viewer and hp.post_id = s.id
        )
        and (
          v_before is null
          or s.created_at < v_before
          or (s.created_at = v_before and (v_before_id is null or s.id < v_before_id))
        )
      order by s.created_at desc, s.id desc
      limit v_limit + 1
    ) sp;
  end if;

  if v_rows is not null and cardinality(v_rows) > 0 then
    if cardinality(v_rows) > v_limit then
      v_rows := v_rows[1:v_limit];
      v_last_id := v_rows[v_limit];
      select s.created_at into v_last_ts from public.social_posts s where s.id = v_last_id;
      v_next := jsonb_build_object('before', v_last_ts, 'beforeId', v_last_id);
    end if;

    select coalesce(
      jsonb_agg(harada_private.hydrate_post(v_viewer, x.id, v_view_as_public) order by x.ord),
      '[]'::jsonb
    )
    into v_items
    from unnest(v_rows) with ordinality as x(id, ord);
  end if;

  return jsonb_build_object(
    'items', v_items,
    'nextCursor', v_next,
    'followingCount', (select count(*)::int from public.social_follows f where f.follower_id = v_viewer)
  );
end;
$$;

/**
 * Returns a single post with its full chronological comment list.
 */
create function public.get_social_post(p_input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_post_id uuid;
  v_post jsonb;
  v_owner uuid;
  v_comments jsonb;
  v_limit int := 30;
  v_before_at timestamptz;
  v_before_id uuid;
  v_more boolean;
begin
  if v_viewer is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  v_post_id := harada_private.req_uuid(p_input, 'postId');
  -- Comments page backwards from the newest: { commentsBefore?: timestamptz, commentsBeforeId?: uuid }.
  if harada_private.has(p_input, 'commentsBefore') then
    v_before_at := (p_input ->> 'commentsBefore')::timestamptz;
    v_before_id := harada_private.req_uuid(p_input, 'commentsBeforeId');
  end if;
  if not harada_private.can_view_post(v_viewer, v_post_id) then
    perform harada_private.fail('NOT_FOUND', 'Post not found');
  end if;

  select sp.author_id into v_owner from public.social_posts sp where sp.id = v_post_id;
  v_post := harada_private.hydrate_post(v_viewer, v_post_id, false);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'postId', c.post_id,
      'body', c.body,
      'createdAt', c.created_at,
      'canDelete', (c.author_id = v_viewer or v_owner = v_viewer),
      'author', jsonb_build_object(
        'userId', c.author_id,
        'username', cp.username,
        'displayName', pr.display_name,
        'avatarUrl', cp.avatar_url
      )
    ) order by c.created_at asc, c.id asc
  ), '[]'::jsonb)
  into v_comments
  from (
    select * from public.social_comments c0
    where c0.post_id = v_post_id
      and not harada_private.is_blocked_between(v_viewer, c0.author_id)
      and (v_before_at is null or (c0.created_at, c0.id) < (v_before_at, v_before_id))
    order by c0.created_at desc, c0.id desc
    limit v_limit
  ) c
  join public.profiles pr on pr.id = c.author_id
  join public.social_profiles cp on cp.user_id = c.author_id;

  select exists (
    select 1 from public.social_comments c1
    where c1.post_id = v_post_id
      and not harada_private.is_blocked_between(v_viewer, c1.author_id)
      and (c1.created_at, c1.id) < coalesce(
        (select (x ->> 'createdAt')::timestamptz from jsonb_array_elements(v_comments) x limit 1), 'infinity'::timestamptz)
  ) into v_more;

  return v_post || jsonb_build_object(
    'comments', v_comments,
    'olderComments', case when v_more and jsonb_array_length(v_comments) > 0 then jsonb_build_object(
      'before', v_comments -> 0 ->> 'createdAt', 'beforeId', v_comments -> 0 ->> 'id') else null end);
end;
$$;

/**
 * Likes or unlikes a post:
 *   { postId: uuid, like?: boolean }
 */
create function public.toggle_post_like(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_post_id uuid;
  v_author uuid;
  v_currently_liked boolean;
  v_should_like boolean;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  v_post_id := harada_private.req_uuid(p_input, 'postId');
  if not harada_private.can_view_post(v_uid, v_post_id) then
    perform harada_private.fail('NOT_FOUND', 'Post not found');
  end if;

  perform harada_private.check_social_rate_limit(v_uid, 'like', 120, interval '15 minutes');

  select sp.author_id into v_author from public.social_posts sp where sp.id = v_post_id;
  v_currently_liked := exists (
    select 1 from public.social_likes l where l.post_id = v_post_id and l.user_id = v_uid
  );

  if harada_private.has(p_input, 'like') then
    v_should_like := (p_input -> 'like') = 'true'::jsonb;
  else
    v_should_like := not v_currently_liked;
  end if;

  if v_should_like then
    insert into public.social_likes (post_id, user_id)
    values (v_post_id, v_uid)
    on conflict (post_id, user_id) do nothing;

    if v_author <> v_uid then
      insert into public.social_notifications (recipient_id, actor_id, kind, post_id)
      values (v_author, v_uid, 'post_liked', v_post_id)
      on conflict do nothing;
    end if;
  else
    delete from public.social_likes where post_id = v_post_id and user_id = v_uid;
  end if;

  return jsonb_build_object(
    'postId', v_post_id,
    'liked', v_should_like,
    'likeCount', (select count(*)::int from public.social_likes l where l.post_id = v_post_id)
  );
end;
$$;

/**
 * Adds a comment to a visible post:
 *   { postId: uuid, body: string }
 */
create function public.add_post_comment(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_post_id uuid;
  v_body text;
  v_author uuid;
  v_comment public.social_comments;
  v_display_name text;
  v_username text;
  v_avatar text;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  v_post_id := harada_private.req_uuid(p_input, 'postId');
  v_body := harada_private.txt(p_input, 'body', 500, true);

  if not harada_private.can_view_post(v_uid, v_post_id) then
    perform harada_private.fail('NOT_FOUND', 'Post not found');
  end if;

  perform harada_private.check_social_rate_limit(v_uid, 'comment', 40, interval '15 minutes');

  select sp.author_id into v_author from public.social_posts sp where sp.id = v_post_id;

  insert into public.social_comments (post_id, author_id, body, created_at)
  values (v_post_id, v_uid, v_body, harada_private.now_ms())
  returning * into v_comment;

  if v_author <> v_uid then
    insert into public.social_notifications (recipient_id, actor_id, kind, post_id, comment_id)
    values (v_author, v_uid, 'post_commented', v_post_id, v_comment.id);
  end if;

  select p.display_name, s.username, s.avatar_url
  into v_display_name, v_username, v_avatar
  from public.profiles p
  join public.social_profiles s on s.user_id = p.id
  where p.id = v_uid;

  return jsonb_build_object(
    'comment', jsonb_build_object(
      'id', v_comment.id,
      'postId', v_comment.post_id,
      'body', v_comment.body,
      'createdAt', v_comment.created_at,
      'canDelete', true,
      'author', jsonb_build_object(
        'userId', v_uid,
        'username', v_username,
        'displayName', v_display_name,
        'avatarUrl', v_avatar
      )
    ),
    'commentCount', (
      select count(*)::int from public.social_comments c
      where c.post_id = v_post_id and not harada_private.is_blocked_between(v_uid, c.author_id)
    )
  );
end;
$$;

/**
 * Deletes a comment. Permitted only for the comment's author OR the owner of the post (moderation).
 */
create function public.delete_post_comment(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_comment_id uuid;
  v_comment public.social_comments;
  v_post_owner uuid;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  v_comment_id := harada_private.req_uuid(p_input, 'commentId');

  select * into v_comment from public.social_comments where id = v_comment_id;
  if not found then perform harada_private.fail('NOT_FOUND', 'Comment not found'); end if;

  select sp.author_id into v_post_owner from public.social_posts sp where sp.id = v_comment.post_id;
  if v_comment.author_id <> v_uid and v_post_owner <> v_uid then
    perform harada_private.fail('NOT_FOUND', 'Comment not found');
  end if;

  delete from public.social_comments where id = v_comment_id;

  return jsonb_build_object(
    'deleted', true,
    'commentId', v_comment_id,
    'postId', v_comment.post_id,
    'commentCount', (
      select count(*)::int from public.social_comments c
      where c.post_id = v_comment.post_id and not harada_private.is_blocked_between(v_uid, c.author_id)
    )
  );
end;
$$;

/**
 * Hides a post from the caller's feed or reports it for moderation:
 *   { postId: uuid, action: 'hide' | 'report', reason?: string }
 */
create function public.hide_or_report_post(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_post_id uuid;
  v_action text;
  v_reason text;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  v_post_id := harada_private.req_uuid(p_input, 'postId');
  v_action := harada_private.txt(p_input, 'action', 16, true);
  if v_action not in ('hide', 'report') then
    perform harada_private.fail('VALIDATION', 'Choose hide or report', 'action');
  end if;

  if not exists (select 1 from public.social_posts sp where sp.id = v_post_id) then
    perform harada_private.fail('NOT_FOUND', 'Post not found');
  end if;

  insert into public.social_hidden_posts (user_id, post_id)
  values (v_uid, v_post_id)
  on conflict (user_id, post_id) do nothing;

  if v_action = 'report' then
    v_reason := coalesce(harada_private.txt(p_input, 'reason', 500, false), '');
    insert into public.social_reports (reporter_id, post_id, reason)
    values (v_uid, v_post_id, v_reason)
    on conflict (reporter_id, post_id) do update set reason = excluded.reason;
  end if;

  return jsonb_build_object('hidden', true, 'reported', v_action = 'report', 'postId', v_post_id);
end;
$$;

/**
 * Lists the caller's in-app notifications (strictly recipient_id = auth.uid()).
 */
create function public.list_social_notifications(p_input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int := 30;
  v_items jsonb;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is not null and jsonb_typeof(p_input) = 'object' and harada_private.has(p_input, 'limit') then
    v_limit := greatest(1, least(100, (p_input ->> 'limit')::int));
  end if;

  select coalesce(jsonb_agg(n_obj order by n_created desc), '[]'::jsonb)
  into v_items
  from (
    select
      n.created_at as n_created,
      jsonb_build_object(
        'id', n.id,
        'kind', n.kind,
        'postId', n.post_id,
        'commentId', n.comment_id,
        'readAt', n.read_at,
        'createdAt', n.created_at,
        'actor', jsonb_build_object(
          'userId', n.actor_id,
          'username', s.username,
          'displayName', p.display_name,
          'avatarUrl', s.avatar_url
        ),
        'postHeadline', (
          select case when sp.headline <> '' then sp.headline else left(sp.body, 80) end
          from public.social_posts sp
          where sp.id = n.post_id and harada_private.can_view_post(v_uid, sp.id)
        )
      ) as n_obj
    from public.social_notifications n
    join public.profiles p on p.id = n.actor_id
    join public.social_profiles s on s.user_id = n.actor_id
    where n.recipient_id = v_uid
      and not harada_private.is_blocked_between(v_uid, n.actor_id)
    order by n.created_at desc
    limit v_limit
  ) notif_rows;

  return jsonb_build_object(
    'items', v_items,
    'unreadCount', (
      select count(*)::int
      from public.social_notifications n
      where n.recipient_id = v_uid
        and n.read_at is null
        and not harada_private.is_blocked_between(v_uid, n.actor_id)
    )
  );
end;
$$;

/**
 * Marks one or all of the caller's notifications as read:
 *   { notificationId?: uuid }
 */
create function public.mark_notifications_read(p_input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := null;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is not null and jsonb_typeof(p_input) = 'object' and harada_private.has(p_input, 'notificationId') then
    v_id := harada_private.req_uuid(p_input, 'notificationId');
    update public.social_notifications
    set read_at = coalesce(read_at, harada_private.now_ms())
    where id = v_id and recipient_id = v_uid;
  else
    update public.social_notifications
    set read_at = coalesce(read_at, harada_private.now_ms())
    where recipient_id = v_uid and read_at is null;
  end if;

  return jsonb_build_object(
    'unreadCount', (
      select count(*)::int
      from public.social_notifications n
      where n.recipient_id = v_uid
        and n.read_at is null
        and not harada_private.is_blocked_between(v_uid, n.actor_id)
    )
  );
end;
$$;

revoke all on function
  public.get_social_profile(jsonb),
  public.update_social_profile(jsonb),
  public.set_goal_visibility(jsonb),
  public.get_goal_visibility(jsonb),
  public.follow_user(jsonb),
  public.unfollow_user(jsonb),
  public.block_user(jsonb),
  public.unblock_user(jsonb),
  public.list_follow_connections(jsonb),
  public.discover_users(jsonb),
  public.create_social_post(jsonb),
  public.update_social_post(jsonb),
  public.delete_social_post(jsonb),
  public.get_social_feed(jsonb),
  public.get_social_post(jsonb),
  public.toggle_post_like(jsonb),
  public.add_post_comment(jsonb),
  public.delete_post_comment(jsonb),
  public.hide_or_report_post(jsonb),
  public.list_social_notifications(jsonb),
  public.mark_notifications_read(jsonb)
from public, anon;

/**
 * { postId } -> { postId, image } for a post the caller may see (can_view_post: author, visibility, goal
 * privacy, blocks). Photos are loaded one by one as cards scroll into view, never inside a feed page.
 */
create function public.get_post_image(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_image text;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  v_id := harada_private.req_uuid(p, 'postId');
  if not harada_private.can_view_post(v_uid, v_id) then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  select sp.image_url into v_image from public.social_posts sp where sp.id = v_id;
  if v_image is null then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  return jsonb_build_object('postId', v_id, 'image', v_image);
end;
$$;

revoke all on function public.get_post_image(jsonb) from public, anon;
grant execute on function public.get_post_image(jsonb) to authenticated;

grant execute on function
  public.get_social_profile(jsonb),
  public.update_social_profile(jsonb),
  public.set_goal_visibility(jsonb),
  public.get_goal_visibility(jsonb),
  public.follow_user(jsonb),
  public.unfollow_user(jsonb),
  public.block_user(jsonb),
  public.unblock_user(jsonb),
  public.list_follow_connections(jsonb),
  public.discover_users(jsonb),
  public.create_social_post(jsonb),
  public.update_social_post(jsonb),
  public.delete_social_post(jsonb),
  public.get_social_feed(jsonb),
  public.get_social_post(jsonb),
  public.toggle_post_like(jsonb),
  public.add_post_comment(jsonb),
  public.delete_post_comment(jsonb),
  public.hide_or_report_post(jsonb),
  public.list_social_notifications(jsonb),
  public.mark_notifications_read(jsonb)
to authenticated;
