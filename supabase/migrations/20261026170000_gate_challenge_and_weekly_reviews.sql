-- Harada Pro gates the 30-Day Challenge and the weekly and monthly reviews.
--
-- Supersedes the free-tier rules of 20261026125000 (reviews) and 20261026130000 (challenge), which were applied
-- to the live project before this decision. Applied migrations are never edited: this file carries the change.
--
--  * New feature 'challenge' for Pro. join/leave/complete_challenge, challenge_summary and `challenge` share
--    cards raise HG402 without it.
--  * Weekly and monthly reflections need 'advanced_reviews' to create, edit, delete or READ (row-level
--    security hides them from a Free user). Daily reflections stay Free. Nothing is deleted on a downgrade:
--    the rows stay stored and reappear on upgrade.
--  * challenge_enrollments rows are likewise hidden without 'challenge'.

-- 1. The 'challenge' feature -------------------------------------------------------------------------------
alter table public.plan_features drop constraint plan_features_feature_check;
alter table public.plan_features add constraint plan_features_feature_check check (feature in (
  'multiple_goals', 'progress_history', 'advanced_reviews', 'premium_templates', 'ai_planning', 'insights', 'challenge'));
insert into public.plan_features (plan_id, feature) values ('pro', 'challenge') on conflict do nothing;

-- 2. Entitlement helper for policies (the caller only) ---------------------------------------------------------
create function harada_private.current_user_has_feature(p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select harada_private.has_feature((select auth.uid()), p_feature) $$;

-- 3. Reflections ------------------------------------------------------------------------------------------------
create function harada_private.check_reflection_access(p_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_owner uuid;
begin
  select r.kind, g.owner_id into v_kind, v_owner from public.reflections r
  join public.goals g on g.id = r.goal_id
  where r.id = p_id;
  if not found then
    return;
  end if;
  if v_owner = (select auth.uid()) and v_kind in ('weekly', 'monthly') then
    perform harada_private.require_feature('advanced_reviews',
      'Reflect. Learn. Improve. Weekly reflections help you evaluate your progress, identify what''s holding you back, and adjust your approach. Unlock weekly reflections with Harada Pro.');
  end if;
end;
$$;

create or replace function harada_private.add_reflection_impl(p_input jsonb)
returns public.reflections
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  g public.goals := harada_private.lock_goal(harada_private.req_uuid(p_input, 'goalId'), false);
  v_id uuid := harada_private.opt_uuid(p_input, 'id');
  v_date date := harada_private.opt_date(p_input, 'date');
  r public.reflections;
begin
  if v_id is not null then
    perform harada_private.check_reflection_access(v_id);
    select * into r from public.reflections where id = v_id;
    if found then
      if r.goal_id <> g.id then perform harada_private.fail('CONFLICT', 'This was changed elsewhere — reload'); end if;
      return r;
    end if;
  end if;
  if v_date is null then perform harada_private.fail('VALIDATION', 'Required', 'date'); end if;
  if v_date > harada_private.user_today() then
    perform harada_private.fail('VALIDATION', 'Reflection date cannot be in the future', 'date');
  end if;
  if (p_input ->> 'kind') is null or (p_input ->> 'kind') not in ('daily', 'weekly', 'monthly') then
    perform harada_private.fail('VALIDATION', 'Choose daily, weekly or monthly', 'kind');
  end if;
  r.id := coalesce(v_id, gen_random_uuid());
  r.goal_id := g.id;
  r.date := v_date;
  r.kind := p_input ->> 'kind';
  r.went_well := coalesce(harada_private.txt(p_input, 'wentWell', 4000), '');
  r.didnt_go_well := coalesce(harada_private.txt(p_input, 'didntGoWell', 4000), '');
  r.next_change := coalesce(harada_private.txt(p_input, 'nextChange', 4000), '');
  r.answers := harada_private.parse_answers(p_input -> 'answers');
  perform harada_private.check_reflection_fields(r);
  insert into public.reflections (id, goal_id, date, kind, went_well, didnt_go_well, next_change, answers, created_at, updated_at)
  values (r.id, r.goal_id, r.date, r.kind, r.went_well, r.didnt_go_well, r.next_change, r.answers,
          harada_private.now_ms(), harada_private.now_ms())
  returning * into r;
  return r;
end;
$$;

create or replace function harada_private.update_reflection_impl(p_input jsonb)
returns public.reflections
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  v_id uuid := harada_private.req_uuid(p_input, 'reflectionId');
  r public.reflections; n public.reflections;
  v_date date;
begin
  perform harada_private.check_reflection_access(v_id);
  select * into r from public.reflections where id = v_id for update;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  perform harada_private.assert_fresh(r.updated_at, p_input);
  n := r;
  if harada_private.has(p_input, 'date') then
    v_date := harada_private.opt_date(p_input, 'date');
    if v_date > harada_private.user_today() then
      perform harada_private.fail('VALIDATION', 'Reflection date cannot be in the future', 'date');
    end if;
    n.date := v_date;
  end if;
  if harada_private.has(p_input, 'kind') then
    if (p_input ->> 'kind') not in ('daily', 'weekly', 'monthly') then
      perform harada_private.fail('VALIDATION', 'Choose daily, weekly or monthly', 'kind');
    end if;
    n.kind := p_input ->> 'kind';
  end if;
  if p_input ? 'wentWell' then n.went_well := coalesce(harada_private.txt(p_input, 'wentWell', 4000), ''); end if;
  if p_input ? 'didntGoWell' then n.didnt_go_well := coalesce(harada_private.txt(p_input, 'didntGoWell', 4000), ''); end if;
  if p_input ? 'nextChange' then n.next_change := coalesce(harada_private.txt(p_input, 'nextChange', 4000), ''); end if;
  if p_input ? 'answers' then n.answers := harada_private.parse_answers(p_input -> 'answers'); end if;
  perform harada_private.check_reflection_fields(n);
  if (n.date, n.kind, n.went_well, n.didnt_go_well, n.next_change, n.answers)
     is not distinct from (r.date, r.kind, r.went_well, r.didnt_go_well, r.next_change, r.answers) then
    return r;
  end if;
  update public.reflections set date = n.date, kind = n.kind, went_well = n.went_well,
    didnt_go_well = n.didnt_go_well, next_change = n.next_change, answers = n.answers,
    updated_at = harada_private.now_ms()
  where id = r.id returning * into n;
  return n;
end;
$$;

create or replace function harada_private.delete_reflection_impl(p_input jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  v_id uuid := harada_private.req_uuid(p_input, 'reflectionId');
begin
  perform harada_private.check_reflection_access(v_id);
  delete from public.reflections where id = v_id;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
end;
$$;

create or replace function harada_private.enforce_review_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if new.kind in ('weekly', 'monthly')
     or (tg_op = 'UPDATE' and old.kind in ('weekly', 'monthly'))
     or (new.answers <> '{}'::jsonb and (tg_op = 'INSERT' or new.answers is distinct from old.answers)) then
    select owner_id into v_owner from public.goals where id = new.goal_id;
    if not harada_private.has_feature(v_owner, 'advanced_reviews') then
      perform harada_private.fail('UPGRADE_REQUIRED',
        'Reflect. Learn. Improve. Weekly reflections help you evaluate your progress, identify what''s holding you back, and adjust your approach. Unlock weekly reflections with Harada Pro.',
        'advanced_reviews');
    end if;
  end if;
  return new;
end;
$$;

drop policy reflections_select_own on public.reflections;
create policy reflections_select_own on public.reflections
  for select to authenticated
  using ((select public.owns_goal(goal_id))
         and (kind = 'daily' or (select harada_private.current_user_has_feature('advanced_reviews'))));

-- 4. Challenge ---------------------------------------------------------------------------------------------------
create or replace function public.join_challenge(p_input jsonb)
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
  perform harada_private.require_feature('challenge',
    'Commit to 30 Days of Progress. Turn your goal into a structured daily practice with the Harada 30-Day Challenge. Unlock the full challenge with Harada Pro.');
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

create or replace function public.leave_challenge(p_input jsonb)
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
  perform harada_private.require_feature('challenge',
    'Commit to 30 Days of Progress. Turn your goal into a structured daily practice with the Harada 30-Day Challenge. Unlock the full challenge with Harada Pro.');
  select * into e from public.challenge_enrollments
  where id = harada_private.req_uuid(p_input, 'enrollmentId') and user_id = v_uid for update;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  if e.status <> 'active' then return e; end if;
  update public.challenge_enrollments set status = 'left', left_at = now(), updated_at = now()
  where id = e.id returning * into e;
  return e;
end;
$$;

create or replace function public.complete_challenge(p_input jsonb)
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
  perform harada_private.require_feature('challenge',
    'Commit to 30 Days of Progress. Turn your goal into a structured daily practice with the Harada 30-Day Challenge. Unlock the full challenge with Harada Pro.');
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

create or replace function public.challenge_summary(p_enrollment_id uuid)
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
  perform harada_private.require_feature('challenge',
    'Commit to 30 Days of Progress. Turn your goal into a structured daily practice with the Harada 30-Day Challenge. Unlock the full challenge with Harada Pro.');
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

drop policy challenge_select_own on public.challenge_enrollments;
create policy challenge_select_own on public.challenge_enrollments
  for select to authenticated
  using (user_id = (select auth.uid()) and (select harada_private.current_user_has_feature('challenge')));

-- 5. Challenge share cards ---------------------------------------------------------------------------------------
create or replace function harada_private.build_card(p_uid uuid, p_input jsonb)
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
  if v_kind = 'challenge' then
    perform harada_private.require_feature('challenge',
      'Commit to 30 Days of Progress. Turn your goal into a structured daily practice with the Harada 30-Day Challenge. Unlock the full challenge with Harada Pro.');
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

-- 6. Privileges (new functions default to PUBLIC execute on Supabase) ----------------------------------------------
revoke all on function harada_private.current_user_has_feature(text), harada_private.check_reflection_access(uuid)
  from public, anon;
grant execute on function harada_private.current_user_has_feature(text), harada_private.check_reflection_access(uuid)
  to authenticated;
