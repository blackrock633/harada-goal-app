-- Share links and referral attribution (docs/PREMIUM_SYSTEM.md).
--
-- A share link is a SNAPSHOT, built on the server from the fields the user ticked, at the moment they create
-- it. It never points at a goal: the public page reads only the snapshot, so nothing else about the goal (its
-- other text, matrix, reflections, notes) can be reached through it, whatever the token. Tokens are 256 bits of
-- gen_random_uuid() randomness, never a database id. Links expire (default 90 days) and can be revoked.
--
-- Referrals: every profile has a random referral code. A sign-up carrying a valid code (sign-up metadata
-- `referral_code`) is attributed once, to one referrer, never to oneself; a first paid subscription marks it
-- converted (billing_apply in the analytics migration).

-- ---------------------------------------------------------------------------
-- Share links
-- ---------------------------------------------------------------------------
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid references public.goals (id) on delete set null,
  kind text not null,
  /** Exactly what the public page shows; built by create_share_link from an allow-list of fields. */
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  view_count integer not null default 0,
  constraint share_links_kind_check check (kind in ('progress', 'weekly', 'challenge')),
  constraint share_links_token_check check (token ~ '^[a-f0-9]{64}$'),
  constraint share_links_payload_check check (jsonb_typeof(payload) = 'object' and char_length(payload::text) <= 4000)
);

create index share_links_user_idx on public.share_links (user_id, created_at desc);

alter table public.share_links enable row level security;
revoke all on public.share_links from public, anon, authenticated;
grant select on public.share_links to authenticated;
create policy share_links_select_own on public.share_links
  for select to authenticated using (user_id = (select auth.uid()));

/** Optional user-written line on a card: trimmed, <= 200 characters, '' when absent. */
create function harada_private.card_text(p jsonb, k text)
returns text
language sql
immutable
set search_path = ''
as $$ select coalesce(harada_private.txt(p, k, 200), '') $$;

/**
 * Builds the card content for one of the caller's goals from the fields they selected:
 *   {goalId, kind: 'progress'|'weekly'|'challenge', show: {goalTitle?, stats?, name?}, accomplishment?,
 *    milestone?, lesson?, nextPriority?}
 * Numbers come from the database, never from the client; text fields are the user's own words for the card.
 * Shared by the in-app card preview (preview_share_card) and the public link (create_share_link).
 */
create function harada_private.build_card(p_uid uuid, p_input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  g public.goals;
  v_kind text := p_input ->> 'kind';
  v_show jsonb := coalesce(p_input -> 'show', '{}'::jsonb);
  v_tz text;
  v_today date;
  v_week date;
  v_stats jsonb := null;
  e public.challenge_enrollments;
  v_card jsonb;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then perform harada_private.fail('VALIDATION', 'Invalid input'); end if;
  if v_kind is null or v_kind not in ('progress', 'weekly', 'challenge') then
    perform harada_private.fail('VALIDATION', 'Choose a card type', 'kind');
  end if;
  if jsonb_typeof(v_show) <> 'object' then perform harada_private.fail('VALIDATION', 'Invalid input', 'show'); end if;
  select * into g from public.goals where id = harada_private.req_uuid(p_input, 'goalId') and owner_id = p_uid;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  select coalesce(p.time_zone, 'UTC') into v_tz from public.profiles p where p.id = p_uid;
  v_today := (now() at time zone v_tz)::date;
  v_week := date_trunc('week', v_today)::date;

  if (v_show -> 'stats') = 'true'::jsonb then
    if v_kind = 'progress' then
      v_stats := jsonb_build_object(
        'tasksDone', (select count(*) from public.actions a where a.goal_id = g.id and a.kind = 'task'
                       and a.archived_at is null and a.completed_at is not null),
        'tasksTotal', (select count(*) from public.actions a where a.goal_id = g.id and a.kind = 'task' and a.archived_at is null),
        'keyAreas', (select count(*) from public.outcomes o where o.goal_id = g.id and o.archived_at is null),
        'actionsPlanned', (select count(*) from public.actions a where a.goal_id = g.id and a.archived_at is null));
    elsif v_kind = 'weekly' then
      v_stats := jsonb_build_object(
        'weekStart', v_week,
        'tasksCompleted', (select count(*) from public.actions a where a.goal_id = g.id and a.kind = 'task'
                            and a.completed_at is not null and (a.completed_at at time zone v_tz)::date >= v_week),
        'tasksDue', (select count(*) from public.actions a where a.goal_id = g.id and a.kind = 'task' and a.archived_at is null
                      and a.due_date >= v_week and a.due_date < v_week + 7),
        'routineChecks', (select count(*) from public.routine_checks c join public.actions a on a.id = c.action_id
                           where a.goal_id = g.id and c.date >= v_week));
    else
      select * into e from public.challenge_enrollments
      where user_id = p_uid and goal_id = g.id and status in ('active', 'completed')
      order by created_at desc limit 1;
      if not found then perform harada_private.fail('INVALID_STATE', 'This goal is not in a challenge', 'kind'); end if;
      v_stats := jsonb_build_object(
        'day', case when v_today < e.start_date then 0 else least(30, v_today - e.start_date + 1) end,
        'completed', e.status = 'completed',
        'activeDays', (select count(*) from generate_series(e.start_date, least(e.end_date, v_today), interval '1 day') d(day)
          where exists (select 1 from public.actions a where a.goal_id = g.id and a.completed_at is not null
                          and (a.completed_at at time zone v_tz)::date = d.day::date)
             or exists (select 1 from public.routine_checks c join public.actions a on a.id = c.action_id
                          where a.goal_id = g.id and c.date = d.day::date)
             or exists (select 1 from public.reflections r where r.goal_id = g.id and r.date = d.day::date)));
    end if;
  end if;

  v_card := jsonb_build_object('kind', v_kind);
  if (v_show -> 'goalTitle') = 'true'::jsonb then v_card := v_card || jsonb_build_object('goalTitle', g.title); end if;
  if (v_show -> 'name') = 'true'::jsonb then
    v_card := v_card || jsonb_build_object('name', (select p.display_name from public.profiles p where p.id = p_uid));
  end if;
  if v_stats is not null then v_card := v_card || jsonb_build_object('stats', v_stats); end if;
  if harada_private.card_text(p_input, 'accomplishment') <> '' then
    v_card := v_card || jsonb_build_object('accomplishment', harada_private.card_text(p_input, 'accomplishment')); end if;
  if harada_private.card_text(p_input, 'milestone') <> '' then
    v_card := v_card || jsonb_build_object('milestone', harada_private.card_text(p_input, 'milestone')); end if;
  if harada_private.card_text(p_input, 'lesson') <> '' then
    v_card := v_card || jsonb_build_object('lesson', harada_private.card_text(p_input, 'lesson')); end if;
  if harada_private.card_text(p_input, 'nextPriority') <> '' then
    v_card := v_card || jsonb_build_object('nextPriority', harada_private.card_text(p_input, 'nextPriority')); end if;
  return v_card;
end;
$$;

revoke all on function harada_private.build_card(uuid, jsonb), harada_private.card_text(jsonb, text)
  from public, anon, authenticated;

/** The card exactly as it would be shared, without creating anything (the in-app preview and image export). */
create function public.preview_share_card(p_input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  return harada_private.build_card(auth.uid(), p_input);
end;
$$;

/** Same input as preview_share_card plus expiresInDays (1..365, default 90; null = never). Max 20 live links. */
create function public.create_share_link(p_input jsonb)
returns public.share_links
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_card jsonb;
  v_days integer := 90;
  l public.share_links;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  v_card := harada_private.build_card(v_uid, p_input);
  if p_input ? 'expiresInDays' then
    if jsonb_typeof(p_input -> 'expiresInDays') = 'null' then v_days := null;
    elsif jsonb_typeof(p_input -> 'expiresInDays') <> 'number' or (p_input ->> 'expiresInDays')::numeric not between 1 and 365
          or (p_input ->> 'expiresInDays')::numeric <> trunc((p_input ->> 'expiresInDays')::numeric) then
      perform harada_private.fail('VALIDATION', 'Choose 1 to 365 days', 'expiresInDays');
    else v_days := (p_input ->> 'expiresInDays')::integer;
    end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('share_links:' || v_uid::text, 0));
  if (select count(*) from public.share_links s where s.user_id = v_uid and s.revoked_at is null
        and (s.expires_at is null or s.expires_at > now())) >= 20 then
    perform harada_private.fail('LIMIT_REACHED', 'You have 20 live share links. Revoke one to create another.');
  end if;
  insert into public.share_links (token, user_id, goal_id, kind, payload, expires_at)
  values (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
          v_uid, (p_input ->> 'goalId')::uuid, v_card ->> 'kind', v_card,
          case when v_days is null then null else now() + make_interval(days => v_days) end)
  returning * into l;
  insert into public.analytics_events (name, user_id, props) values ('share_link_created', v_uid, jsonb_build_object('kind', l.kind));
  return l;
end;
$$;

/** {id}: the link stops working immediately. */
create function public.revoke_share_link(p_input jsonb)
returns public.share_links
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.share_links;
begin
  if auth.uid() is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  update public.share_links set revoked_at = coalesce(revoked_at, now())
  where id = harada_private.req_uuid(p_input, 'id') and user_id = auth.uid()
  returning * into l;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  return l;
end;
$$;

/**
 * The public read: the snapshot behind a live token, and the sharer's referral code (for "Start your own").
 * Returns null for an unknown, malformed, revoked or expired token, all alike.
 */
create function public.get_shared_card(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.share_links;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
  update public.share_links set view_count = view_count + 1
  where token = p_token and revoked_at is null and (expires_at is null or expires_at > now())
  returning * into l;
  if not found then return null; end if;
  return jsonb_build_object('card', l.payload, 'createdAt', l.created_at,
    'ref', (select p.referral_code from public.profiles p where p.id = l.user_id));
end;
$$;

revoke all on function public.preview_share_card(jsonb), public.create_share_link(jsonb), public.revoke_share_link(jsonb),
  public.get_shared_card(text) from public, anon;
grant execute on function public.preview_share_card(jsonb), public.create_share_link(jsonb), public.revoke_share_link(jsonb)
  to authenticated;
grant execute on function public.get_shared_card(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Referrals
-- ---------------------------------------------------------------------------
create function harada_private.new_referral_code()
returns text
language sql
volatile
set search_path = ''
as $$ select substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) $$;

alter table public.profiles add column referral_code text;
update public.profiles set referral_code = harada_private.new_referral_code() where referral_code is null;
alter table public.profiles alter column referral_code set default harada_private.new_referral_code();
alter table public.profiles alter column referral_code set not null;
alter table public.profiles add constraint profiles_referral_code_unique unique (referral_code);

create table public.referrals (
  referred_id uuid primary key references public.profiles (id) on delete cascade,
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  converted_at timestamptz,
  constraint referrals_not_self_check check (referred_id <> referrer_id)
);

create index referrals_referrer_idx on public.referrals (referrer_id, created_at desc);

alter table public.referrals enable row level security;
revoke all on public.referrals from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  v_tz text := coalesce(new.raw_user_meta_data ->> 'time_zone', 'UTC');
  v_ref text := new.raw_user_meta_data ->> 'referral_code';
  v_referrer uuid;
begin
  if v_name = '' then
    v_name := split_part(coalesce(new.email, 'Friend'), '@', 1);
  end if;
  v_name := left(v_name, 80);
  if v_name = '' then
    v_name := 'Friend';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;
  insert into public.profiles (id, display_name, time_zone) values (new.id, v_name, v_tz);

  -- Referral: a valid code from someone else, and not a burst (25+ attributions to one referrer in 24 h).
  if v_ref is not null and v_ref ~ '^[a-f0-9]{10}$' then
    select p.id into v_referrer from public.profiles p where p.referral_code = v_ref and p.id <> new.id;
    if v_referrer is not null and (select count(*) from public.referrals r
        where r.referrer_id = v_referrer and r.created_at > now() - interval '24 hours') < 25 then
      insert into public.referrals (referred_id, referrer_id) values (new.id, v_referrer) on conflict do nothing;
      insert into public.analytics_events (name, user_id, props)
      values ('referral_signup_completed', new.id, '{}'::jsonb);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

/** The caller's referral code and how many sign-ups and paid conversions it brought. */
create function public.get_my_referrals()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', p.referral_code,
    'signups', (select count(*) from public.referrals r where r.referrer_id = p.id),
    'conversions', (select count(*) from public.referrals r where r.referrer_id = p.id and r.converted_at is not null))
  from public.profiles p where p.id = auth.uid()
$$;

revoke all on function public.get_my_referrals() from public, anon;
grant execute on function public.get_my_referrals() to authenticated;
revoke all on function harada_private.new_referral_code() from public, anon, authenticated;
