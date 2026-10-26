-- The Harada 30-Day Challenge (docs/PREMIUM_SYSTEM.md). Free for everyone.
--
-- An enrollment ties one of the caller's goals to 30 consecutive days in their own time zone. Nothing is
-- stored per day: progress is read from what already happened on the goal (completed tasks, routine checks,
-- reflections), so the challenge can never disagree with the plan. A missed day is just a day with no
-- activity; the challenge keeps going and nobody has to restart.
--
-- Writes go through SECURITY DEFINER functions that check auth.uid() themselves; `authenticated` may only
-- SELECT its own enrollments.

create table public.challenge_enrollments (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'active',
  committed_at timestamptz not null,
  completed_at timestamptz,
  left_at timestamptz,
  final_reflection text not null default '',
  /** Up to 5 accomplishments the user chose to record, each <= 200 characters. */
  accomplishments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint challenge_status_check check (status in ('active', 'completed', 'left')),
  constraint challenge_length_check check (end_date = start_date + 29),
  constraint challenge_final_reflection_len_check check (char_length(final_reflection) <= 4000),
  constraint challenge_accomplishments_check check (
    jsonb_typeof(accomplishments) = 'array' and jsonb_array_length(accomplishments) <= 5)
);

-- One running challenge per person; a double tap on "Join" can never create a second.
create unique index challenge_one_active_per_user on public.challenge_enrollments (user_id) where status = 'active';
create index challenge_user_idx on public.challenge_enrollments (user_id, created_at desc);
create index challenge_goal_idx on public.challenge_enrollments (goal_id);

alter table public.challenge_enrollments enable row level security;
revoke all on public.challenge_enrollments from public, anon, authenticated;
grant select on public.challenge_enrollments to authenticated;
create policy challenge_select_own on public.challenge_enrollments
  for select to authenticated using (user_id = (select auth.uid()));

create function harada_private.today_for(p_user uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce((select p.time_zone from public.profiles p where p.id = p_user), 'UTC'))::date
$$;

revoke all on function harada_private.today_for(uuid) from public, anon, authenticated;

/**
 * {id, goalId, committed: true, startDate?}. startDate is today (default) or tomorrow, in the caller's time zone.
 * Idempotent on `id`; refuses a second running challenge.
 */
create function public.join_challenge(p_input jsonb)
returns public.challenge_enrollments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_goal uuid;
  v_today date;
  v_start date;
  e public.challenge_enrollments;
  g public.goals;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then perform harada_private.fail('VALIDATION', 'Invalid input'); end if;
  v_id := harada_private.req_uuid(p_input, 'id');
  v_goal := harada_private.req_uuid(p_input, 'goalId');
  select * into e from public.challenge_enrollments where id = v_id;
  if found then
    if e.user_id <> v_uid then perform harada_private.fail('CONFLICT', 'This was changed elsewhere — reload'); end if;
    return e;
  end if;
  if (p_input -> 'committed') is distinct from 'true'::jsonb then
    perform harada_private.fail('VALIDATION', 'Confirm your commitment to start the challenge', 'committed');
  end if;
  select * into g from public.goals where id = v_goal and owner_id = v_uid;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  if g.status <> 'active' then
    perform harada_private.fail('INVALID_STATE', 'Start working on this goal before joining the challenge', 'goalId');
  end if;
  v_today := harada_private.today_for(v_uid);
  v_start := coalesce(harada_private.opt_date(p_input, 'startDate'), v_today);
  if v_start < v_today or v_start > v_today + 1 then
    perform harada_private.fail('VALIDATION', 'Start today or tomorrow', 'startDate');
  end if;
  begin
    insert into public.challenge_enrollments (id, user_id, goal_id, start_date, end_date, committed_at)
    values (v_id, v_uid, v_goal, v_start, v_start + 29, now())
    returning * into e;
  exception when unique_violation then
    perform harada_private.fail('CONFLICT', 'You are already in a challenge. Finish or leave it first.');
  end;
  insert into public.analytics_events (name, user_id, props) values ('challenge_joined', v_uid, '{}'::jsonb);
  return e;
end;
$$;

/** {enrollmentId}: stop a running challenge. The record stays in the history. */
create function public.leave_challenge(p_input jsonb)
returns public.challenge_enrollments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  e public.challenge_enrollments;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  select * into e from public.challenge_enrollments
  where id = harada_private.req_uuid(p_input, 'enrollmentId') and user_id = v_uid for update;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  if e.status <> 'active' then return e; end if;
  update public.challenge_enrollments set status = 'left', left_at = now(), updated_at = now()
  where id = e.id returning * into e;
  return e;
end;
$$;

/**
 * {enrollmentId, finalReflection?, accomplishments?: string[]}: close the challenge from its last day on.
 * Calling it again on a completed challenge updates the reflection and accomplishments.
 */
create function public.complete_challenge(p_input jsonb)
returns public.challenge_enrollments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  e public.challenge_enrollments;
  v_list jsonb := '[]'::jsonb;
  v_item jsonb;
  v_text text;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then perform harada_private.fail('VALIDATION', 'Invalid input'); end if;
  select * into e from public.challenge_enrollments
  where id = harada_private.req_uuid(p_input, 'enrollmentId') and user_id = v_uid for update;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  if e.status = 'left' then perform harada_private.fail('INVALID_STATE', 'This challenge was stopped'); end if;
  if harada_private.today_for(v_uid) < e.end_date then
    perform harada_private.fail('INVALID_STATE', 'The challenge can be completed from day 30');
  end if;
  if harada_private.has(p_input, 'accomplishments') then
    if jsonb_typeof(p_input -> 'accomplishments') <> 'array' or jsonb_array_length(p_input -> 'accomplishments') > 5 then
      perform harada_private.fail('VALIDATION', 'Choose up to 5 accomplishments', 'accomplishments');
    end if;
    for v_item in select value from jsonb_array_elements(p_input -> 'accomplishments') loop
      v_text := harada_private.txt(jsonb_build_object('a', v_item), 'a', 200);
      if v_text is not null and v_text <> '' then v_list := v_list || to_jsonb(v_text); end if;
    end loop;
  else
    v_list := e.accomplishments;
  end if;
  update public.challenge_enrollments set
    status = 'completed',
    completed_at = coalesce(e.completed_at, now()),
    final_reflection = case when p_input ? 'finalReflection'
      then coalesce(harada_private.txt(p_input, 'finalReflection', 4000), '') else e.final_reflection end,
    accomplishments = v_list,
    updated_at = now()
  where id = e.id returning * into e;
  return e;
end;
$$;

/**
 * Everything the challenge dashboard and completion report show, computed from stored data:
 * one entry per challenge day so far (tasks completed, routine days checked, reflections written), totals,
 * weekly reviews written per challenge week, and the tasks completed during the challenge (milestones).
 */
create function public.challenge_summary(p_enrollment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  e public.challenge_enrollments;
  g public.goals;
  v_tz text;
  v_today date;
  v_last date;
  v_days jsonb;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  select * into e from public.challenge_enrollments where id = p_enrollment_id and user_id = v_uid;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  select * into g from public.goals where id = e.goal_id;
  select coalesce(p.time_zone, 'UTC') into v_tz from public.profiles p where p.id = v_uid;
  v_today := (now() at time zone v_tz)::date;
  -- Days counted: up to today while running, up to the end (or the day it was left) once closed.
  v_last := least(e.end_date, case when e.status = 'left' then (e.left_at at time zone v_tz)::date else v_today end);

  select coalesce(jsonb_agg(jsonb_build_object(
      'date', d.day,
      'tasksCompleted', (select count(*) from public.actions a
         where a.goal_id = e.goal_id and a.kind = 'task' and a.completed_at is not null
           and (a.completed_at at time zone v_tz)::date = d.day),
      'routineChecks', (select count(*) from public.routine_checks c join public.actions a on a.id = c.action_id
         where a.goal_id = e.goal_id and c.date = d.day),
      'reflections', (select count(*) from public.reflections r where r.goal_id = e.goal_id and r.date = d.day)
    ) order by d.day), '[]'::jsonb)
  into v_days
  from (select generate_series(e.start_date, v_last, interval '1 day')::date as day) d
  where v_last >= e.start_date;

  return jsonb_build_object(
    'enrollment', to_jsonb(e) - 'user_id',
    'goal', jsonb_build_object('id', g.id, 'title', g.title, 'successCriteria', g.success_criteria, 'status', g.status),
    'today', v_today,
    'day', case when v_today < e.start_date then 0 else least(30, v_today - e.start_date + 1) end,
    'daysRemaining', greatest(0, e.end_date - greatest(v_today, e.start_date - 1)),
    'days', v_days,
    'activeDays', (select count(*) from jsonb_array_elements(v_days) x
       where (x ->> 'tasksCompleted')::int + (x ->> 'routineChecks')::int + (x ->> 'reflections')::int > 0),
    'tasksCompleted', (select coalesce(sum((x ->> 'tasksCompleted')::int), 0) from jsonb_array_elements(v_days) x),
    'routineChecks', (select coalesce(sum((x ->> 'routineChecks')::int), 0) from jsonb_array_elements(v_days) x),
    'tasksPlanned', (select count(*) from public.actions a
       where a.goal_id = e.goal_id and a.kind = 'task'
         and (a.archived_at is null or a.completed_at is not null)
         and (a.completed_at is null or (a.completed_at at time zone v_tz)::date >= e.start_date)),
    'weeklyReviews', (select coalesce(jsonb_agg(jsonb_build_object('week', w.n,
         'done', exists (select 1 from public.reflections r where r.goal_id = e.goal_id and r.kind in ('weekly', 'monthly')
                         and r.date >= e.start_date + (w.n - 1) * 7 and r.date < least(e.start_date + w.n * 7, e.end_date + 1)))
         order by w.n), '[]'::jsonb)
       from generate_series(1, 5) w(n) where e.start_date + (w.n - 1) * 7 <= v_last),
    'milestones', (select coalesce(jsonb_agg(jsonb_build_object('title', a.title, 'date', (a.completed_at at time zone v_tz)::date)
         order by a.completed_at), '[]'::jsonb)
       from public.actions a
       where a.goal_id = e.goal_id and a.kind = 'task' and a.completed_at is not null
         and (a.completed_at at time zone v_tz)::date between e.start_date and v_last)
  );
end;
$$;

revoke all on function public.join_challenge(jsonb), public.leave_challenge(jsonb), public.complete_challenge(jsonb),
  public.challenge_summary(uuid) from public, anon;
grant execute on function public.join_challenge(jsonb), public.leave_challenge(jsonb), public.complete_challenge(jsonb),
  public.challenge_summary(uuid) to authenticated;
