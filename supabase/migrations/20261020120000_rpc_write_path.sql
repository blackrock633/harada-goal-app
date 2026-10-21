-- Write path for direct Supabase clients (D-017): every write goes through a SECURITY INVOKER RPC in
-- `public`; direct INSERT/UPDATE/DELETE by `anon` / `authenticated` is rejected by a guard trigger.
--
-- Why invoker + guard (not SECURITY DEFINER + a dedicated role): invoker functions run as
-- `authenticated`, so the existing RLS policies apply unchanged, and nothing depends on role-admin or
-- schema-grant privileges that differ between hosted Supabase versions.
--
-- The guard is a transaction-local setting, `harada.write_path`, that only these functions (and the
-- trusted Next.js server's UnitOfWork) set. Clients cannot set it: PostgREST exposes only functions in
-- exposed schemas and sets only `request.*` settings, and pg_graphql writes hit the same trigger.
-- FK cascades run as the table owner, so they are not affected.
--
-- Errors: SQLSTATE HG400 VALIDATION, HG401 UNAUTHENTICATED, HG404 NOT_FOUND, HG409 CONFLICT,
-- HG422 INVALID_STATE, HG429 LIMIT_REACHED; `hint` carries the field name ('' when none).
-- Constraint violations keep their native codes (23505/23P01 → CONFLICT, 23514 → VALIDATION).
-- Inputs: one `p_input jsonb` per function, shaped exactly like src/application/schemas.ts (camelCase).

create schema if not exists harada_private;
revoke all on schema harada_private from public, anon;
grant usage on schema harada_private to authenticated;

-- ---------------------------------------------------------------------------
-- Guard
-- ---------------------------------------------------------------------------
create function harada_private.require_write_path()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and coalesce(current_setting('harada.write_path', true), '') <> 'on' then
    raise exception 'Direct writes are not allowed; use the RPC functions'
      using errcode = '42501';
  end if;
  return null;
end;
$$;

create trigger goals_write_path before insert or update or delete on public.goals
  for each statement execute function harada_private.require_write_path();
create trigger outcomes_write_path before insert or update or delete on public.outcomes
  for each statement execute function harada_private.require_write_path();
create trigger actions_write_path before insert or update or delete on public.actions
  for each statement execute function harada_private.require_write_path();
create trigger routine_checks_write_path before insert or update or delete on public.routine_checks
  for each statement execute function harada_private.require_write_path();
create trigger daily_focus_write_path before insert or update or delete on public.daily_focus
  for each statement execute function harada_private.require_write_path();
create trigger reflections_write_path before insert or update or delete on public.reflections
  for each statement execute function harada_private.require_write_path();
create trigger goal_events_write_path before insert or update or delete on public.goal_events
  for each statement execute function harada_private.require_write_path();
-- Profiles are inserted by the sign-up trigger (as the owner); only updates come from users.
create trigger profiles_write_path before update on public.profiles
  for each statement execute function harada_private.require_write_path();

-- ---------------------------------------------------------------------------
-- Private helpers (not exposed by PostgREST; callable by `authenticated` from the RPCs)
-- ---------------------------------------------------------------------------
create function harada_private.fail(p_code text, p_message text, p_field text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = case p_code
      when 'VALIDATION' then 'HG400' when 'UNAUTHENTICATED' then 'HG401' when 'NOT_FOUND' then 'HG404'
      when 'CONFLICT' then 'HG409' when 'INVALID_STATE' then 'HG422' when 'LIMIT_REACHED' then 'HG429'
      else 'HG500' end,
    message = p_message,
    hint = coalesce(p_field, '');
end;
$$;

/** Starts a write: requires a signed-in user, opens the write path, returns auth.uid(). */
create function harada_private.begin_write(p_input jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform harada_private.fail('VALIDATION', 'Invalid input');
  end if;
  perform set_config('harada.write_path', 'on', true);
  return v_uid;
end;
$$;

create function harada_private.now_ms()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select date_trunc('milliseconds', now()) $$;

/** "Today" in the user's own time zone (profiles.time_zone, validated on write). */
create function harada_private.user_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone coalesce(
    (select p.time_zone from public.profiles p where p.id = (select auth.uid())), 'UTC'))::date
$$;

create function harada_private.has(p jsonb, k text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p ? k and jsonb_typeof(p -> k) <> 'null' $$;

/** Trimmed text field; NULL when absent (or JSON null) and not required. */
create function harada_private.txt(p jsonb, k text, max_len int, required boolean default false)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if not harada_private.has(p, k) then
    if required then perform harada_private.fail('VALIDATION', 'Required', k); end if;
    return null;
  end if;
  if jsonb_typeof(p -> k) <> 'string' then perform harada_private.fail('VALIDATION', 'Must be text', k); end if;
  v := regexp_replace(p ->> k, '^\s+|\s+$', '', 'g');
  if required and v = '' then perform harada_private.fail('VALIDATION', 'Required', k); end if;
  if char_length(v) > max_len then
    perform harada_private.fail('VALIDATION', format('Keep it under %s characters', max_len), k);
  end if;
  return v;
end;
$$;

create function harada_private.opt_uuid(p jsonb, k text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not harada_private.has(p, k) then return null; end if;
  if jsonb_typeof(p -> k) <> 'string' then perform harada_private.fail('VALIDATION', 'Invalid id', k); end if;
  return (p ->> k)::uuid;
exception when invalid_text_representation then
  perform harada_private.fail('VALIDATION', 'Invalid id', k);
  return null;
end;
$$;

create function harada_private.req_uuid(p jsonb, k text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v uuid := harada_private.opt_uuid(p, k);
begin
  if v is null then perform harada_private.fail('VALIDATION', 'Required', k); end if;
  return v;
end;
$$;

/** YYYY-MM-DD; NULL when absent or JSON null. */
create function harada_private.opt_date(p jsonb, k text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not harada_private.has(p, k) then return null; end if;
  if jsonb_typeof(p -> k) <> 'string' or (p ->> k) !~ '^\d{4}-\d{2}-\d{2}$' then
    perform harada_private.fail('VALIDATION', 'Use a valid date (YYYY-MM-DD)', k);
  end if;
  return (p ->> k)::date;
exception when datetime_field_overflow or invalid_datetime_format then
  perform harada_private.fail('VALIDATION', 'Use a valid date (YYYY-MM-DD)', k);
  return null;
end;
$$;

create function harada_private.opt_slot(p jsonb, k text)
returns smallint
language plpgsql
immutable
set search_path = ''
as $$
declare
  n numeric;
begin
  if not harada_private.has(p, k) then return null; end if;
  if jsonb_typeof(p -> k) <> 'number' then
    perform harada_private.fail('VALIDATION', 'Position must be an integer between 0 and 7', k);
  end if;
  n := (p ->> k)::numeric;
  if n <> trunc(n) or n < 0 or n > 7 then
    perform harada_private.fail('VALIDATION', 'Position must be an integer between 0 and 7', k);
  end if;
  return n::smallint;
end;
$$;

create function harada_private.num(p jsonb, k text, field text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p -> k) <> 'number' then perform harada_private.fail('VALIDATION', 'Must be a number', field); end if;
  return (p ->> k)::numeric;
end;
$$;

/** Ordered id list for reorders: 1..8 distinct uuids. */
create function harada_private.id_list(p jsonb, k text)
returns uuid[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v uuid[];
begin
  if not harada_private.has(p, k) or jsonb_typeof(p -> k) <> 'array'
     or jsonb_array_length(p -> k) not between 1 and 8 then
    perform harada_private.fail('VALIDATION', 'Provide 1 to 8 ids', k);
  end if;
  select array_agg(e::uuid order by o) into v from jsonb_array_elements_text(p -> k) with ordinality as t(e, o);
  return v;
exception when invalid_text_representation then
  perform harada_private.fail('VALIDATION', 'Invalid id', k);
  return null;
end;
$$;

/** Optimistic concurrency (M-08): compares at millisecond precision, like the web app. */
create function harada_private.assert_fresh(p_current timestamptz, p jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v timestamptz;
begin
  if not harada_private.has(p, 'expectedUpdatedAt') then return; end if;
  begin
    v := (p ->> 'expectedUpdatedAt')::timestamptz;
  exception when others then
    perform harada_private.fail('VALIDATION', 'Invalid timestamp', 'expectedUpdatedAt');
  end;
  if date_trunc('milliseconds', v) <> date_trunc('milliseconds', p_current) then
    perform harada_private.fail('CONFLICT', 'This was changed elsewhere — reload');
  end if;
end;
$$;

/** Locks the goal row (serialises structural edits). NOT_FOUND when missing or not owned (RLS). */
create function harada_private.lock_goal(p_goal_id uuid, p_editable boolean)
returns public.goals
language plpgsql
set search_path = ''
as $$
declare
  g public.goals;
begin
  select * into g from public.goals where id = p_goal_id for update;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  if p_editable and g.status = 'archived' then
    perform harada_private.fail('INVALID_STATE', 'Goal is archived and cannot be edited');
  end if;
  return g;
end;
$$;

create function harada_private.event(
  p_goal_id uuid, p_type text, p_subject uuid, p_summary text, p_data jsonb default '{}'::jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.goal_events (id, goal_id, type, subject_id, summary, data, occurred_at)
  values (gen_random_uuid(), p_goal_id, p_type, p_subject, p_summary, p_data, date_trunc('milliseconds', now()));
$$;

create function harada_private.first_free(p_taken smallint[], p_slots int)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select min(s)::smallint from generate_series(0, p_slots - 1) s where not (s = any (coalesce(p_taken, '{}')))
$$;

/** Measure {target, current = 0, unit = ''} → validated (target, current, unit). */
create function harada_private.parse_measure(
  m jsonb, out o_target numeric, out o_current numeric, out o_unit text)
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(m) <> 'object' then perform harada_private.fail('VALIDATION', 'Invalid measure', 'measure'); end if;
  o_target := harada_private.num(m, 'target', 'measure.target');
  if o_target <= 0 then perform harada_private.fail('VALIDATION', 'Target must be greater than 0', 'measure.target'); end if;
  o_current := case when harada_private.has(m, 'current') then harada_private.num(m, 'current', 'measure.current') else 0 end;
  if o_current < 0 then perform harada_private.fail('VALIDATION', 'Cannot be negative', 'measure.current'); end if;
  o_unit := coalesce(harada_private.txt(m, 'unit', 24), '');
end;
$$;

/** Schedule {type: daily | weekdays(days) | weekly(timesPerWeek)} → normalised columns. */
create function harada_private.parse_schedule(
  s jsonb, out o_type text, out o_days smallint[], out o_times smallint)
language plpgsql
immutable
set search_path = ''
as $$
declare
  n numeric;
begin
  if jsonb_typeof(s) <> 'object' then perform harada_private.fail('VALIDATION', 'Invalid schedule type', 'schedule'); end if;
  o_type := s ->> 'type';
  if o_type = 'daily' then
    return;
  elsif o_type = 'weekdays' then
    if jsonb_typeof(s -> 'days') <> 'array' or jsonb_array_length(s -> 'days') not between 1 and 7 then
      perform harada_private.fail('VALIDATION', 'Pick at least one day', 'schedule');
    end if;
    if exists (select 1 from jsonb_array_elements(s -> 'days') d
               where jsonb_typeof(d) <> 'number' or d::text::numeric not in (0, 1, 2, 3, 4, 5, 6)) then
      perform harada_private.fail('VALIDATION', 'invalid weekday', 'schedule');
    end if;
    select array_agg(distinct d::text::smallint order by d::text::smallint) into o_days
      from jsonb_array_elements(s -> 'days') d;
  elsif o_type = 'weekly' then
    if jsonb_typeof(s -> 'timesPerWeek') <> 'number' then
      perform harada_private.fail('VALIDATION', 'timesPerWeek must be an integer between 1 and 7', 'schedule');
    end if;
    n := (s ->> 'timesPerWeek')::numeric;
    if n <> trunc(n) or n < 1 or n > 7 then
      perform harada_private.fail('VALIDATION', 'timesPerWeek must be an integer between 1 and 7', 'schedule');
    end if;
    o_times := n::smallint;
  else
    perform harada_private.fail('VALIDATION', 'Invalid schedule type', 'schedule');
  end if;
end;
$$;

/** Inserts an outcome into a goal (explicit free slot, or the first free one). */
create function harada_private.insert_outcome(p_goal_id uuid, o jsonb, p_now timestamptz)
returns public.outcomes
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := coalesce(harada_private.opt_uuid(o, 'id'), gen_random_uuid());
  v_title text := harada_private.txt(o, 'title', 120, true);
  v_desc text := coalesce(harada_private.txt(o, 'description', 1000), '');
  v_pos smallint := harada_private.opt_slot(o, 'position');
  v_target numeric; v_current numeric; v_unit text;
  v_taken smallint[];
  r public.outcomes;
begin
  if harada_private.has(o, 'measure') then
    select * into v_target, v_current, v_unit from harada_private.parse_measure(o -> 'measure');
  end if;
  select array_agg(x.position) into v_taken from public.outcomes x where x.goal_id = p_goal_id and x.archived_at is null;
  if coalesce(cardinality(v_taken), 0) >= 8 then perform harada_private.fail('LIMIT_REACHED', 'Max outcomes reached'); end if;
  if v_pos is not null and v_pos = any (coalesce(v_taken, '{}')) then
    perform harada_private.fail('CONFLICT', 'That slot is already filled', 'position');
  end if;
  v_pos := coalesce(v_pos, harada_private.first_free(v_taken, 8));
  insert into public.outcomes (id, goal_id, title, description, measure_target, measure_current, measure_unit,
                               position, created_at, updated_at)
  values (v_id, p_goal_id, v_title, v_desc, v_target, v_current, v_unit, v_pos, p_now, p_now)
  returning * into r;
  return r;
end;
$$;

/** Inserts an action into an outcome (task or routine). */
create function harada_private.insert_action(
  p_goal_id uuid, p_outcome_id uuid, a jsonb, p_today date, p_now timestamptz)
returns public.actions
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := coalesce(harada_private.opt_uuid(a, 'id'), gen_random_uuid());
  v_title text := harada_private.txt(a, 'title', 160, true);
  v_notes text := coalesce(harada_private.txt(a, 'notes', 2000), '');
  v_kind text := a ->> 'kind';
  v_pos smallint := harada_private.opt_slot(a, 'position');
  v_due date := harada_private.opt_date(a, 'dueDate');
  v_type text; v_days smallint[]; v_times smallint; v_start date;
  v_taken smallint[];
  r public.actions;
begin
  if v_kind is null or v_kind not in ('task', 'routine') then
    perform harada_private.fail('VALIDATION', 'Choose task or routine', 'kind');
  end if;
  if v_kind = 'routine' then
    if not harada_private.has(a, 'schedule') then
      perform harada_private.fail('VALIDATION', 'Routine requires a schedule', 'schedule');
    end if;
    select * into v_type, v_days, v_times from harada_private.parse_schedule(a -> 'schedule');
    v_due := null;
    v_start := p_today;
  elsif harada_private.has(a, 'schedule') then
    perform harada_private.fail('VALIDATION', 'Task cannot have a schedule', 'schedule');
  end if;
  select array_agg(x.position) into v_taken from public.actions x
    where x.outcome_id = p_outcome_id and x.archived_at is null;
  if coalesce(cardinality(v_taken), 0) >= 8 then perform harada_private.fail('LIMIT_REACHED', 'Max actions reached'); end if;
  if v_pos is not null and v_pos = any (coalesce(v_taken, '{}')) then
    perform harada_private.fail('CONFLICT', 'That slot is already filled', 'position');
  end if;
  v_pos := coalesce(v_pos, harada_private.first_free(v_taken, 8));
  insert into public.actions (id, goal_id, outcome_id, title, notes, kind, position, due_date, schedule_type,
                              schedule_days, schedule_times_per_week, start_date, created_at, updated_at)
  values (v_id, p_goal_id, p_outcome_id, v_title, v_notes, v_kind, v_pos, v_due, v_type, v_days, v_times,
          v_start, p_now, p_now)
  returning * into r;
  return r;
end;
$$;

/** Action visible to the caller (RLS), locked, with its goal locked first. */
create function harada_private.action_with_goal(p_action_id uuid, p_editable boolean,
  out o_action public.actions, out o_goal public.goals)
language plpgsql
set search_path = ''
as $$
declare
  v_goal_id uuid;
begin
  select a.goal_id into v_goal_id from public.actions a where a.id = p_action_id;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  o_goal := harada_private.lock_goal(v_goal_id, p_editable);
  select * into o_action from public.actions a where a.id = p_action_id for update;
end;
$$;

create function harada_private.outcome_with_goal(p_outcome_id uuid, p_editable boolean,
  out o_outcome public.outcomes, out o_goal public.goals)
language plpgsql
set search_path = ''
as $$
declare
  v_goal_id uuid;
begin
  select o.goal_id into v_goal_id from public.outcomes o where o.id = p_outcome_id;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  o_goal := harada_private.lock_goal(v_goal_id, p_editable);
  select * into o_outcome from public.outcomes o where o.id = p_outcome_id for update;
end;
$$;

-- ---------------------------------------------------------------------------
-- Goals
-- ---------------------------------------------------------------------------

/**
 * Creates a goal (draft), optionally with its initial matrix in the same transaction:
 * {id?, title, vision?, successCriteria?, targetDate?, purpose?, templateId?,
 *  outcomes?: [{id?, title, description?, measure?, position?, actions?: [{id?, title, notes?, kind,
 *  dueDate?, schedule?, position?}]}]}
 * Idempotent on `id`: a replay returns the existing goal unchanged.
 */
create function public.create_goal(p_input jsonb)
returns public.goals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  v_now timestamptz := harada_private.now_ms();
  v_today date := harada_private.user_today();
  v_id uuid := coalesce(harada_private.opt_uuid(p_input, 'id'), gen_random_uuid());
  v_purpose jsonb := coalesce(p_input -> 'purpose', '{}'::jsonb);
  v_template text := harada_private.txt(p_input, 'templateId', 64);
  g public.goals;
  v_o jsonb; v_a jsonb;
  v_out public.outcomes;
begin
  select * into g from public.goals where id = v_id;
  if found then return g; end if;
  if jsonb_typeof(v_purpose) not in ('object', 'null') then
    perform harada_private.fail('VALIDATION', 'Invalid purpose', 'purpose');
  end if;
  insert into public.goals (id, owner_id, title, vision, success_criteria, target_date, status,
    purpose_self_tangible, purpose_self_intangible, purpose_others_tangible, purpose_others_intangible,
    created_at, updated_at)
  values (v_id, v_uid,
    harada_private.txt(p_input, 'title', 120, true),
    coalesce(harada_private.txt(p_input, 'vision', 2000), ''),
    coalesce(harada_private.txt(p_input, 'successCriteria', 2000), ''),
    harada_private.opt_date(p_input, 'targetDate'),
    'draft',
    coalesce(harada_private.txt(v_purpose, 'selfTangible', 1000), ''),
    coalesce(harada_private.txt(v_purpose, 'selfIntangible', 1000), ''),
    coalesce(harada_private.txt(v_purpose, 'othersTangible', 1000), ''),
    coalesce(harada_private.txt(v_purpose, 'othersIntangible', 1000), ''),
    v_now, v_now)
  returning * into g;

  if harada_private.has(p_input, 'outcomes') then
    if jsonb_typeof(p_input -> 'outcomes') <> 'array' or jsonb_array_length(p_input -> 'outcomes') > 8 then
      perform harada_private.fail('VALIDATION', 'Provide at most 8 key areas', 'outcomes');
    end if;
    for v_o in select value from jsonb_array_elements(p_input -> 'outcomes') loop
      v_out := harada_private.insert_outcome(g.id, v_o, v_now);
      if harada_private.has(v_o, 'actions') then
        if jsonb_typeof(v_o -> 'actions') <> 'array' or jsonb_array_length(v_o -> 'actions') > 8 then
          perform harada_private.fail('VALIDATION', 'Provide at most 8 actions per key area', 'actions');
        end if;
        for v_a in select value from jsonb_array_elements(v_o -> 'actions') loop
          perform harada_private.insert_action(g.id, v_out.id, v_a, v_today, v_now);
        end loop;
      end if;
    end loop;
  end if;

  perform harada_private.event(g.id, 'goal_created', g.id,
    case when v_template is null then format('Created goal "%s"', g.title)
         else format('Created goal "%s" from a template', g.title) end,
    case when v_template is null then '{}'::jsonb else jsonb_build_object('templateId', v_template) end);
  return g;
end;
$$;

/** {goalId, expectedUpdatedAt?, title?, vision?, successCriteria?, targetDate?, purpose?} */
create function public.update_goal(p_input jsonb)
returns public.goals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  v_now timestamptz := harada_private.now_ms();
  g public.goals := harada_private.lock_goal(harada_private.req_uuid(p_input, 'goalId'), true);
  n public.goals;
  v_changed text[] := '{}';
  v_p jsonb := p_input -> 'purpose';
  v text;
  v_purpose_changed boolean := false;
begin
  perform harada_private.assert_fresh(g.updated_at, p_input);
  n := g;
  if harada_private.has(p_input, 'title') then
    v := harada_private.txt(p_input, 'title', 120, true);
    if v <> n.title then n.title := v; v_changed := array_append(v_changed, 'title'); end if;
  end if;
  if p_input ? 'vision' then
    v := coalesce(harada_private.txt(p_input, 'vision', 2000), '');
    if v <> n.vision then n.vision := v; v_changed := array_append(v_changed, 'vision'); end if;
  end if;
  if p_input ? 'successCriteria' then
    v := coalesce(harada_private.txt(p_input, 'successCriteria', 2000), '');
    if v <> n.success_criteria then n.success_criteria := v; v_changed := array_append(v_changed, 'successCriteria'); end if;
  end if;
  if p_input ? 'targetDate' then
    if n.target_date is distinct from harada_private.opt_date(p_input, 'targetDate') then
      n.target_date := harada_private.opt_date(p_input, 'targetDate');
      v_changed := array_append(v_changed, 'targetDate');
    end if;
  end if;
  if harada_private.has(p_input, 'purpose') then
    if jsonb_typeof(v_p) <> 'object' then perform harada_private.fail('VALIDATION', 'Invalid purpose', 'purpose'); end if;
    if v_p ? 'selfTangible' then
      v := coalesce(harada_private.txt(v_p, 'selfTangible', 1000), '');
      if v <> n.purpose_self_tangible then n.purpose_self_tangible := v; v_purpose_changed := true; end if;
    end if;
    if v_p ? 'selfIntangible' then
      v := coalesce(harada_private.txt(v_p, 'selfIntangible', 1000), '');
      if v <> n.purpose_self_intangible then n.purpose_self_intangible := v; v_purpose_changed := true; end if;
    end if;
    if v_p ? 'othersTangible' then
      v := coalesce(harada_private.txt(v_p, 'othersTangible', 1000), '');
      if v <> n.purpose_others_tangible then n.purpose_others_tangible := v; v_purpose_changed := true; end if;
    end if;
    if v_p ? 'othersIntangible' then
      v := coalesce(harada_private.txt(v_p, 'othersIntangible', 1000), '');
      if v <> n.purpose_others_intangible then n.purpose_others_intangible := v; v_purpose_changed := true; end if;
    end if;
    if v_purpose_changed then v_changed := array_append(v_changed, 'purpose'); end if;
  end if;
  if cardinality(v_changed) = 0 then return g; end if;
  update public.goals set
    title = n.title, vision = n.vision, success_criteria = n.success_criteria, target_date = n.target_date,
    purpose_self_tangible = n.purpose_self_tangible, purpose_self_intangible = n.purpose_self_intangible,
    purpose_others_tangible = n.purpose_others_tangible, purpose_others_intangible = n.purpose_others_intangible,
    updated_at = v_now
  where id = g.id
  returning * into n;
  perform harada_private.event(g.id, 'goal_updated', g.id, 'Updated ' || array_to_string(v_changed, ', '),
    jsonb_build_object('changed', to_jsonb(v_changed)));
  return n;
end;
$$;

/** {goalId}. Lifecycle: draft → active ⇄ achieved; any → archived → previous status. */
create function harada_private.transition_goal(p_input jsonb, p_kind text)
returns public.goals
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  v_now timestamptz := harada_private.now_ms();
  g public.goals := harada_private.lock_goal(harada_private.req_uuid(p_input, 'goalId'), false);
  v_outcomes int; v_actions int;
  v_event text; v_summary text;
begin
  if p_kind = 'activate' then
    if g.status <> 'draft' then perform harada_private.fail('INVALID_STATE', 'Goal is not draft'); end if;
    select count(*) into v_outcomes from public.outcomes o where o.goal_id = g.id and o.archived_at is null;
    select count(*) into v_actions from public.actions a join public.outcomes o on o.id = a.outcome_id
      where a.goal_id = g.id and a.archived_at is null and o.archived_at is null;
    if v_outcomes < 1 or v_actions < 1 then
      perform harada_private.fail('INVALID_STATE',
        'Goal must have at least 1 active outcome and 1 active action to activate');
    end if;
    update public.goals set status = 'active', activated_on = coalesce(activated_on, harada_private.user_today()),
      updated_at = v_now where id = g.id returning * into g;
    v_event := 'goal_activated'; v_summary := 'Activated goal';
  elsif p_kind = 'achieve' then
    if g.status <> 'active' then perform harada_private.fail('INVALID_STATE', 'Only active goals can be achieved'); end if;
    update public.goals set status = 'achieved', achieved_at = v_now, updated_at = v_now
      where id = g.id returning * into g;
    v_event := 'goal_achieved'; v_summary := 'Marked goal achieved';
  elsif p_kind = 'reopen' then
    if g.status <> 'achieved' then perform harada_private.fail('INVALID_STATE', 'Only achieved goals can be reopened'); end if;
    update public.goals set status = 'active', achieved_at = null, updated_at = v_now
      where id = g.id returning * into g;
    v_event := 'goal_reopened'; v_summary := 'Reopened goal';
  elsif p_kind = 'archive' then
    if g.status = 'archived' then return g; end if;
    update public.goals set status = 'archived', status_before_archive = status, archived_at = v_now,
      updated_at = v_now where id = g.id returning * into g;
    v_event := 'goal_archived'; v_summary := 'Archived goal';
  elsif p_kind = 'restore' then
    if g.status <> 'archived' then return g; end if;
    update public.goals set status = coalesce(status_before_archive, 'draft'), status_before_archive = null,
      archived_at = null, updated_at = v_now where id = g.id returning * into g;
    v_event := 'goal_restored'; v_summary := 'Restored goal';
  end if;
  perform harada_private.event(g.id, v_event, g.id, v_summary);
  return g;
end;
$$;

create function public.activate_goal(p_input jsonb) returns public.goals
language sql security invoker set search_path = ''
as $$ select harada_private.transition_goal(p_input, 'activate') $$;
create function public.mark_goal_achieved(p_input jsonb) returns public.goals
language sql security invoker set search_path = ''
as $$ select harada_private.transition_goal(p_input, 'achieve') $$;
create function public.reopen_goal(p_input jsonb) returns public.goals
language sql security invoker set search_path = ''
as $$ select harada_private.transition_goal(p_input, 'reopen') $$;
create function public.archive_goal(p_input jsonb) returns public.goals
language sql security invoker set search_path = ''
as $$ select harada_private.transition_goal(p_input, 'archive') $$;
create function public.restore_goal(p_input jsonb) returns public.goals
language sql security invoker set search_path = ''
as $$ select harada_private.transition_goal(p_input, 'restore') $$;

/** {goalId, confirmTitle}: only archived goals, and the exact title must be typed. */
create function public.delete_goal(p_input jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  g public.goals := harada_private.lock_goal(harada_private.req_uuid(p_input, 'goalId'), false);
begin
  if g.status <> 'archived' then perform harada_private.fail('INVALID_STATE', 'Only archived goals can be deleted'); end if;
  if (p_input ->> 'confirmTitle') is distinct from g.title then
    perform harada_private.fail('VALIDATION', 'Title confirmation does not match', 'confirmTitle');
  end if;
  delete from public.goals where id = g.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Outcomes (key areas)
-- ---------------------------------------------------------------------------

/** {id?, goalId, position?, title, description?, measure?}. Idempotent on `id`. */
create function public.add_outcome(p_input jsonb)
returns public.outcomes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  g public.goals := harada_private.lock_goal(harada_private.req_uuid(p_input, 'goalId'), false);
  v_id uuid := harada_private.opt_uuid(p_input, 'id');
  r public.outcomes;
begin
  if v_id is not null then
    select * into r from public.outcomes where id = v_id;
    if found then
      if r.goal_id <> g.id then perform harada_private.fail('CONFLICT', 'This was changed elsewhere — reload'); end if;
      return r;
    end if;
  end if;
  if g.status = 'archived' then perform harada_private.fail('INVALID_STATE', 'Goal is archived and cannot be edited'); end if;
  r := harada_private.insert_outcome(g.id, p_input, harada_private.now_ms());
  perform harada_private.event(g.id, 'outcome_added', r.id, format('Added outcome "%s"', r.title),
    jsonb_build_object('position', r.position));
  return r;
end;
$$;

/** {outcomeId, expectedUpdatedAt?, title?, description?, measure? (null clears)} */
create function public.update_outcome(p_input jsonb)
returns public.outcomes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  v_now timestamptz := harada_private.now_ms();
  o public.outcomes; g public.goals; v_r record; n public.outcomes;
  v_changed text[] := '{}';
  v text;
  v_target numeric; v_current numeric; v_unit text;
begin
  select * into v_r from harada_private.outcome_with_goal(harada_private.req_uuid(p_input, 'outcomeId'), true);
  o := v_r.o_outcome; g := v_r.o_goal;
  perform harada_private.assert_fresh(o.updated_at, p_input);
  if o.archived_at is not null then perform harada_private.fail('INVALID_STATE', 'Cannot edit archived outcome'); end if;
  n := o;
  if harada_private.has(p_input, 'title') then
    v := harada_private.txt(p_input, 'title', 120, true);
    if v <> n.title then n.title := v; v_changed := array_append(v_changed, 'title'); end if;
  end if;
  if p_input ? 'description' then
    v := coalesce(harada_private.txt(p_input, 'description', 1000), '');
    if v <> n.description then n.description := v; v_changed := array_append(v_changed, 'description'); end if;
  end if;
  if p_input ? 'measure' then
    if harada_private.has(p_input, 'measure') then
      select * into v_target, v_current, v_unit from harada_private.parse_measure(p_input -> 'measure');
    end if;
    if (v_target, v_current, v_unit) is distinct from (n.measure_target, n.measure_current, n.measure_unit) then
      n.measure_target := v_target; n.measure_current := v_current; n.measure_unit := v_unit;
      v_changed := array_append(v_changed, 'measure');
    end if;
  end if;
  if cardinality(v_changed) = 0 then return o; end if;
  update public.outcomes set title = n.title, description = n.description, measure_target = n.measure_target,
    measure_current = n.measure_current, measure_unit = n.measure_unit, updated_at = v_now
  where id = o.id returning * into n;
  perform harada_private.event(g.id, 'outcome_updated', o.id, 'Updated outcome: ' || array_to_string(v_changed, ', '),
    jsonb_build_object('changed', to_jsonb(v_changed)));
  return n;
end;
$$;

/** {outcomeId, current} */
create function public.update_measure_current(p_input jsonb)
returns public.outcomes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  o public.outcomes; g public.goals; v_r record;
  v_from numeric;
  v_to numeric;
begin
  select * into v_r from harada_private.outcome_with_goal(harada_private.req_uuid(p_input, 'outcomeId'), true);
  o := v_r.o_outcome; g := v_r.o_goal;
  v_to := harada_private.num(p_input, 'current', 'current');
  if o.archived_at is not null then perform harada_private.fail('INVALID_STATE', 'Cannot edit archived outcome'); end if;
  if o.measure_target is null then perform harada_private.fail('INVALID_STATE', 'Outcome has no measure'); end if;
  if v_to < 0 then perform harada_private.fail('VALIDATION', 'Cannot be negative', 'current'); end if;
  if v_to = o.measure_current then return o; end if;
  v_from := o.measure_current;
  update public.outcomes set measure_current = v_to, updated_at = harada_private.now_ms()
    where id = o.id returning * into o;
  perform harada_private.event(g.id, 'measure_updated', o.id, format('Progress %s → %s', v_from, v_to),
    jsonb_build_object('from', v_from, 'to', v_to));
  return o;
end;
$$;

/** {outcomeId}: frees its slot; other outcomes keep their positions. */
create function public.archive_outcome(p_input jsonb)
returns public.outcomes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  o public.outcomes; g public.goals; v_r record;
begin
  select * into v_r from harada_private.outcome_with_goal(harada_private.req_uuid(p_input, 'outcomeId'), true);
  o := v_r.o_outcome; g := v_r.o_goal;
  if o.archived_at is not null then return o; end if;
  update public.outcomes set position = null, archived_at = harada_private.now_ms(), updated_at = harada_private.now_ms()
    where id = o.id returning * into o;
  perform harada_private.event(g.id, 'outcome_archived', o.id, format('Archived outcome "%s"', o.title));
  return o;
end;
$$;

/** {outcomeId}: back into the first free slot. */
create function public.restore_outcome(p_input jsonb)
returns public.outcomes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  o public.outcomes; g public.goals; v_r record;
  v_taken smallint[];
begin
  select * into v_r from harada_private.outcome_with_goal(harada_private.req_uuid(p_input, 'outcomeId'), true);
  o := v_r.o_outcome; g := v_r.o_goal;
  if o.archived_at is null then return o; end if;
  select array_agg(x.position) into v_taken from public.outcomes x where x.goal_id = g.id and x.archived_at is null;
  if coalesce(cardinality(v_taken), 0) >= 8 then perform harada_private.fail('LIMIT_REACHED', 'Max outcomes reached'); end if;
  update public.outcomes set position = harada_private.first_free(v_taken, 8), archived_at = null,
    updated_at = harada_private.now_ms() where id = o.id returning * into o;
  perform harada_private.event(g.id, 'outcome_restored', o.id, format('Restored outcome "%s"', o.title),
    jsonb_build_object('position', o.position));
  return o;
end;
$$;

/** {goalId, orderedIds}: must list exactly the goal's active outcomes. */
create function public.reorder_outcomes(p_input jsonb)
returns setof public.outcomes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  g public.goals := harada_private.lock_goal(harada_private.req_uuid(p_input, 'goalId'), true);
  v_ids uuid[] := harada_private.id_list(p_input, 'orderedIds');
  v_active uuid[];
begin
  select array_agg(x.id) into v_active from public.outcomes x where x.goal_id = g.id and x.archived_at is null;
  if cardinality(v_ids) <> coalesce(cardinality(v_active), 0)
     or (select count(distinct e) from unnest(v_ids) e) <> cardinality(v_ids)
     or not (v_ids <@ coalesce(v_active, '{}')) then
    perform harada_private.fail('CONFLICT', 'This was changed elsewhere — reload');
  end if;
  set constraints public.outcomes_goal_position_excl deferred;
  update public.outcomes x set position = (t.o - 1)::smallint, updated_at = harada_private.now_ms()
    from unnest(v_ids) with ordinality as t(id, o) where x.id = t.id;
  set constraints public.outcomes_goal_position_excl immediate;
  perform harada_private.event(g.id, 'outcomes_reordered', null, 'Reordered outcomes',
    jsonb_build_object('orderedIds', to_jsonb(v_ids)));
  return query select * from public.outcomes x where x.goal_id = g.id and x.archived_at is null order by x.position;
end;
$$;

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------

/** {id?, outcomeId, position?, title, notes?, kind, dueDate?, schedule?}. Idempotent on `id`. */
create function public.add_action(p_input jsonb)
returns public.actions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  v_outcome_id uuid := harada_private.req_uuid(p_input, 'outcomeId');
  v_id uuid := harada_private.opt_uuid(p_input, 'id');
  o public.outcomes; g public.goals; v_r record;
  r public.actions;
begin
  select * into v_r from harada_private.outcome_with_goal(v_outcome_id, false);
  o := v_r.o_outcome; g := v_r.o_goal;
  if v_id is not null then
    select * into r from public.actions where id = v_id;
    if found then
      if r.outcome_id <> o.id then perform harada_private.fail('CONFLICT', 'This was changed elsewhere — reload'); end if;
      return r;
    end if;
  end if;
  if g.status = 'archived' then perform harada_private.fail('INVALID_STATE', 'Goal is archived and cannot be edited'); end if;
  if o.archived_at is not null then
    perform harada_private.fail('INVALID_STATE', 'Cannot add actions to an archived outcome');
  end if;
  r := harada_private.insert_action(g.id, o.id, p_input, harada_private.user_today(), harada_private.now_ms());
  perform harada_private.event(g.id, 'action_added', r.id, format('Added action "%s"', r.title),
    jsonb_build_object('outcomeId', o.id, 'position', r.position));
  return r;
end;
$$;

/** {actionId, expectedUpdatedAt?, title?, notes?, kind?, dueDate?, schedule?} */
create function public.update_action(p_input jsonb)
returns public.actions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  a public.actions; g public.goals; v_r record; n public.actions;
  v_changed text[] := '{}';
  v text;
  v_kind text;
  v_type text; v_days smallint[]; v_times smallint;
  v_due date;
begin
  select * into v_r from harada_private.action_with_goal(harada_private.req_uuid(p_input, 'actionId'), true);
  a := v_r.o_action; g := v_r.o_goal;
  perform harada_private.assert_fresh(a.updated_at, p_input);
  if a.archived_at is not null then perform harada_private.fail('INVALID_STATE', 'Cannot edit archived action'); end if;
  n := a;
  if harada_private.has(p_input, 'title') then
    v := harada_private.txt(p_input, 'title', 160, true);
    if v <> n.title then n.title := v; v_changed := array_append(v_changed, 'title'); end if;
  end if;
  if p_input ? 'notes' then
    v := coalesce(harada_private.txt(p_input, 'notes', 2000), '');
    if v <> n.notes then n.notes := v; v_changed := array_append(v_changed, 'notes'); end if;
  end if;
  if harada_private.has(p_input, 'kind') then
    v_kind := p_input ->> 'kind';
    if v_kind not in ('task', 'routine') then perform harada_private.fail('VALIDATION', 'Choose task or routine', 'kind'); end if;
    if v_kind <> n.kind then n.kind := v_kind; v_changed := array_append(v_changed, 'kind'); end if;
  end if;
  if n.kind = 'routine' then
    if p_input ? 'schedule' then
      if not harada_private.has(p_input, 'schedule') then
        perform harada_private.fail('VALIDATION', 'Routine requires a schedule', 'schedule');
      end if;
      select * into v_type, v_days, v_times from harada_private.parse_schedule(p_input -> 'schedule');
      if (v_type, v_days, v_times) is distinct from (n.schedule_type, n.schedule_days, n.schedule_times_per_week) then
        n.schedule_type := v_type; n.schedule_days := v_days; n.schedule_times_per_week := v_times;
        v_changed := array_append(v_changed, 'schedule');
      end if;
    elsif n.schedule_type is null then
      perform harada_private.fail('VALIDATION', 'Routine requires a schedule', 'schedule');
    end if;
    n.due_date := null;
    n.completed_at := null;
    n.start_date := coalesce(n.start_date, harada_private.user_today());
  else
    if harada_private.has(p_input, 'schedule') then
      perform harada_private.fail('VALIDATION', 'Task cannot have a schedule', 'schedule');
    end if;
    if p_input ? 'dueDate' then
      v_due := harada_private.opt_date(p_input, 'dueDate');
      if v_due is distinct from n.due_date then n.due_date := v_due; v_changed := array_append(v_changed, 'dueDate'); end if;
    end if;
    n.schedule_type := null; n.schedule_days := null; n.schedule_times_per_week := null;
    n.start_date := null;
  end if;
  if cardinality(v_changed) = 0 then return a; end if;
  update public.actions set title = n.title, notes = n.notes, kind = n.kind, due_date = n.due_date,
    completed_at = n.completed_at, schedule_type = n.schedule_type, schedule_days = n.schedule_days,
    schedule_times_per_week = n.schedule_times_per_week, start_date = n.start_date,
    updated_at = harada_private.now_ms()
  where id = a.id returning * into n;
  perform harada_private.event(g.id, 'action_updated', a.id, 'Updated action: ' || array_to_string(v_changed, ', '),
    jsonb_build_object('changed', to_jsonb(v_changed)));
  return n;
end;
$$;

/** {actionId}: complete or reopen a task. Idempotent. */
create function harada_private.toggle_task(p_input jsonb, p_complete boolean)
returns public.actions
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  a public.actions; g public.goals; v_r record;
begin
  select * into v_r from harada_private.action_with_goal(harada_private.req_uuid(p_input, 'actionId'), true);
  a := v_r.o_action; g := v_r.o_goal;
  if a.archived_at is not null then perform harada_private.fail('INVALID_STATE', 'Cannot edit archived action'); end if;
  if a.kind = 'routine' then
    perform harada_private.fail('INVALID_STATE', case when p_complete then 'Cannot complete a routine' else 'Cannot reopen a routine' end);
  end if;
  if p_complete then
    if a.completed_at is not null then return a; end if;
    update public.actions set completed_at = harada_private.now_ms(), updated_at = harada_private.now_ms()
      where id = a.id returning * into a;
    perform harada_private.event(g.id, 'action_completed', a.id, format('Completed "%s"', a.title));
  else
    if a.completed_at is null then return a; end if;
    update public.actions set completed_at = null, updated_at = harada_private.now_ms()
      where id = a.id returning * into a;
    perform harada_private.event(g.id, 'action_reopened', a.id, format('Reopened "%s"', a.title));
  end if;
  return a;
end;
$$;

create function public.complete_action(p_input jsonb) returns public.actions
language sql security invoker set search_path = ''
as $$ select harada_private.toggle_task(p_input, true) $$;
create function public.reopen_action(p_input jsonb) returns public.actions
language sql security invoker set search_path = ''
as $$ select harada_private.toggle_task(p_input, false) $$;

/** {actionId, date}: check or uncheck a routine for a past-or-today date on/after its start. Idempotent. */
create function harada_private.toggle_check(p_input jsonb, p_check boolean)
returns public.actions
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  a public.actions; g public.goals; v_r record;
  v_date date := harada_private.opt_date(p_input, 'date');
begin
  select * into v_r from harada_private.action_with_goal(harada_private.req_uuid(p_input, 'actionId'), true);
  a := v_r.o_action; g := v_r.o_goal;
  if v_date is null then perform harada_private.fail('VALIDATION', 'Required', 'date'); end if;
  if a.archived_at is not null then perform harada_private.fail('INVALID_STATE', 'Cannot check archived action'); end if;
  if a.kind <> 'routine' or a.start_date is null then
    perform harada_private.fail('INVALID_STATE', 'Only routines can be checked');
  end if;
  if v_date > harada_private.user_today() then perform harada_private.fail('VALIDATION', 'Cannot check future dates', 'date'); end if;
  if v_date < a.start_date then
    perform harada_private.fail('VALIDATION', 'Cannot check dates before routine start date', 'date');
  end if;
  if p_check then
    insert into public.routine_checks (id, action_id, date, created_at)
    values (gen_random_uuid(), a.id, v_date, harada_private.now_ms())
    on conflict (action_id, date) do nothing;
  else
    delete from public.routine_checks where action_id = a.id and date = v_date;
  end if;
  return a;
end;
$$;

create function public.check_routine(p_input jsonb) returns public.actions
language sql security invoker set search_path = ''
as $$ select harada_private.toggle_check(p_input, true) $$;
create function public.uncheck_routine(p_input jsonb) returns public.actions
language sql security invoker set search_path = ''
as $$ select harada_private.toggle_check(p_input, false) $$;

/** {actionId}: frees its slot. */
create function public.archive_action(p_input jsonb)
returns public.actions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  a public.actions; g public.goals; v_r record;
begin
  select * into v_r from harada_private.action_with_goal(harada_private.req_uuid(p_input, 'actionId'), true);
  a := v_r.o_action; g := v_r.o_goal;
  if a.archived_at is not null then return a; end if;
  update public.actions set position = null, archived_at = harada_private.now_ms(), updated_at = harada_private.now_ms()
    where id = a.id returning * into a;
  perform harada_private.event(g.id, 'action_archived', a.id, format('Archived "%s"', a.title));
  return a;
end;
$$;

/** {actionId}: back into the first free slot of its (active) outcome. */
create function public.restore_action(p_input jsonb)
returns public.actions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  a public.actions; g public.goals; v_r record;
  v_taken smallint[];
begin
  select * into v_r from harada_private.action_with_goal(harada_private.req_uuid(p_input, 'actionId'), true);
  a := v_r.o_action; g := v_r.o_goal;
  if a.archived_at is null then return a; end if;
  if exists (select 1 from public.outcomes o where o.id = a.outcome_id and o.archived_at is not null) then
    perform harada_private.fail('INVALID_STATE', 'Restore the outcome first, then restore this action');
  end if;
  select array_agg(x.position) into v_taken from public.actions x
    where x.outcome_id = a.outcome_id and x.archived_at is null;
  if coalesce(cardinality(v_taken), 0) >= 8 then perform harada_private.fail('LIMIT_REACHED', 'Max actions reached'); end if;
  update public.actions set position = harada_private.first_free(v_taken, 8), archived_at = null,
    updated_at = harada_private.now_ms() where id = a.id returning * into a;
  perform harada_private.event(g.id, 'action_restored', a.id, format('Restored "%s"', a.title),
    jsonb_build_object('position', a.position));
  return a;
end;
$$;

/** {actionId, toOutcomeId, toPosition}: into a free slot of an active outcome in the same goal (no swaps). */
create function public.move_action(p_input jsonb)
returns public.actions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  a public.actions; g public.goals; v_r record; t public.outcomes;
  v_to uuid := harada_private.req_uuid(p_input, 'toOutcomeId');
  v_pos smallint := harada_private.opt_slot(p_input, 'toPosition');
  v_from uuid;
  v_others smallint[];
begin
  if v_pos is null then perform harada_private.fail('VALIDATION', 'Required', 'toPosition'); end if;
  select * into v_r from harada_private.action_with_goal(harada_private.req_uuid(p_input, 'actionId'), true);
  a := v_r.o_action; g := v_r.o_goal;
  select * into t from public.outcomes where id = v_to;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  if a.archived_at is not null then perform harada_private.fail('INVALID_STATE', 'Cannot move archived action'); end if;
  if t.archived_at is not null then perform harada_private.fail('INVALID_STATE', 'Cannot move to an archived outcome'); end if;
  if t.goal_id <> a.goal_id then perform harada_private.fail('VALIDATION', 'Cannot move action to a different goal'); end if;
  if t.id = a.outcome_id and a.position = v_pos then return a; end if;
  select array_agg(x.position) into v_others from public.actions x
    where x.outcome_id = t.id and x.archived_at is null and x.id <> a.id;
  if t.id <> a.outcome_id and coalesce(cardinality(v_others), 0) >= 8 then
    perform harada_private.fail('LIMIT_REACHED', 'Max actions reached in target outcome');
  end if;
  if v_pos = any (coalesce(v_others, '{}')) then
    perform harada_private.fail('CONFLICT', 'That slot is already filled', 'toPosition');
  end if;
  v_from := a.outcome_id;
  update public.actions set outcome_id = t.id, position = v_pos, updated_at = harada_private.now_ms()
    where id = a.id returning * into a;
  perform harada_private.event(g.id, 'action_moved', a.id, format('Moved "%s"', a.title),
    jsonb_build_object('fromOutcomeId', v_from, 'toOutcomeId', t.id, 'toPosition', v_pos));
  return a;
end;
$$;

/** {outcomeId, orderedIds}: must list exactly the outcome's active actions. */
create function public.reorder_actions(p_input jsonb)
returns setof public.actions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  o public.outcomes; g public.goals; v_r record;
  v_ids uuid[] := harada_private.id_list(p_input, 'orderedIds');
  v_active uuid[];
begin
  select * into v_r from harada_private.outcome_with_goal(harada_private.req_uuid(p_input, 'outcomeId'), true);
  o := v_r.o_outcome; g := v_r.o_goal;
  select array_agg(x.id) into v_active from public.actions x where x.outcome_id = o.id and x.archived_at is null;
  if cardinality(v_ids) <> coalesce(cardinality(v_active), 0)
     or (select count(distinct e) from unnest(v_ids) e) <> cardinality(v_ids)
     or not (v_ids <@ coalesce(v_active, '{}')) then
    perform harada_private.fail('CONFLICT', 'This was changed elsewhere — reload');
  end if;
  set constraints public.actions_outcome_position_excl deferred;
  update public.actions x set position = (t.o - 1)::smallint, updated_at = harada_private.now_ms()
    from unnest(v_ids) with ordinality as t(id, o) where x.id = t.id;
  set constraints public.actions_outcome_position_excl immediate;
  perform harada_private.event(g.id, 'actions_reordered', o.id, 'Reordered actions',
    jsonb_build_object('orderedIds', to_jsonb(v_ids)));
  return query select * from public.actions x where x.outcome_id = o.id and x.archived_at is null order by x.position;
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily focus (D-016)
-- ---------------------------------------------------------------------------

/** {actionId, date?}: date defaults to the user's today; up to 7 days ahead; 5 per day; idempotent. */
create function public.add_to_today(p_input jsonb)
returns public.daily_focus
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  v_today date := harada_private.user_today();
  v_date date := coalesce(harada_private.opt_date(p_input, 'date'), v_today);
  v_action_id uuid := harada_private.req_uuid(p_input, 'actionId');
  a public.actions; o public.outcomes; g public.goals; v_r record;
  f public.daily_focus;
  v_taken smallint[];
begin
  select * into a from public.actions where id = v_action_id;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  select * into o from public.outcomes where id = a.outcome_id;
  select * into g from public.goals where id = a.goal_id;
  if v_date < v_today or v_date > v_today + 7 then
    perform harada_private.fail('VALIDATION', 'You can plan focus from today up to 7 days ahead', 'date');
  end if;
  if a.archived_at is not null or o.archived_at is not null or g.status in ('archived', 'achieved') then
    perform harada_private.fail('INVALID_STATE', 'Only actions in a live plan can be added to a day');
  end if;
  -- Serialise adds for this user and day so concurrent picks get distinct slots (or a clean limit error).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_date::text, 0));
  select * into f from public.daily_focus where owner_id = v_uid and action_id = a.id and date = v_date;
  if found then return f; end if;
  select array_agg(x.slot) into v_taken from public.daily_focus x where x.owner_id = v_uid and x.date = v_date;
  if coalesce(cardinality(v_taken), 0) >= 5 then
    perform harada_private.fail('LIMIT_REACHED', 'You can focus on up to 5 actions per day');
  end if;
  insert into public.daily_focus (id, owner_id, action_id, date, slot, created_at)
  values (gen_random_uuid(), v_uid, a.id, v_date, harada_private.first_free(v_taken, 5), harada_private.now_ms())
  returning * into f;
  return f;
end;
$$;

/** {actionId, date?}: idempotent. */
create function public.remove_from_today(p_input jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  v_date date := coalesce(harada_private.opt_date(p_input, 'date'), harada_private.user_today());
  v_action_id uuid := harada_private.req_uuid(p_input, 'actionId');
begin
  if not exists (select 1 from public.actions where id = v_action_id) then
    perform harada_private.fail('NOT_FOUND', 'Not found');
  end if;
  delete from public.daily_focus where owner_id = v_uid and action_id = v_action_id and date = v_date;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reflections
-- ---------------------------------------------------------------------------

create function harada_private.check_reflection_fields(r public.reflections)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if r.went_well = '' and r.didnt_go_well = '' and r.next_change = '' then
    perform harada_private.fail('VALIDATION', 'At least one reflection field must be non-empty');
  end if;
end;
$$;

/** {id?, goalId, date, kind, wentWell?, didntGoWell?, nextChange?}. Idempotent on `id`. */
create function public.add_reflection(p_input jsonb)
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
  if (p_input ->> 'kind') is null or (p_input ->> 'kind') not in ('daily', 'weekly') then
    perform harada_private.fail('VALIDATION', 'Choose daily or weekly', 'kind');
  end if;
  r.id := coalesce(v_id, gen_random_uuid());
  r.goal_id := g.id;
  r.date := v_date;
  r.kind := p_input ->> 'kind';
  r.went_well := coalesce(harada_private.txt(p_input, 'wentWell', 4000), '');
  r.didnt_go_well := coalesce(harada_private.txt(p_input, 'didntGoWell', 4000), '');
  r.next_change := coalesce(harada_private.txt(p_input, 'nextChange', 4000), '');
  perform harada_private.check_reflection_fields(r);
  insert into public.reflections (id, goal_id, date, kind, went_well, didnt_go_well, next_change, created_at, updated_at)
  values (r.id, r.goal_id, r.date, r.kind, r.went_well, r.didnt_go_well, r.next_change,
          harada_private.now_ms(), harada_private.now_ms())
  returning * into r;
  return r;
end;
$$;

/** {reflectionId, expectedUpdatedAt?, date?, kind?, wentWell?, didntGoWell?, nextChange?} */
create function public.update_reflection(p_input jsonb)
returns public.reflections
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  r public.reflections; n public.reflections;
  v_date date;
begin
  select * into r from public.reflections where id = harada_private.req_uuid(p_input, 'reflectionId') for update;
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
    if (p_input ->> 'kind') not in ('daily', 'weekly') then perform harada_private.fail('VALIDATION', 'Choose daily or weekly', 'kind'); end if;
    n.kind := p_input ->> 'kind';
  end if;
  if p_input ? 'wentWell' then n.went_well := coalesce(harada_private.txt(p_input, 'wentWell', 4000), ''); end if;
  if p_input ? 'didntGoWell' then n.didnt_go_well := coalesce(harada_private.txt(p_input, 'didntGoWell', 4000), ''); end if;
  if p_input ? 'nextChange' then n.next_change := coalesce(harada_private.txt(p_input, 'nextChange', 4000), ''); end if;
  perform harada_private.check_reflection_fields(n);
  if (n.date, n.kind, n.went_well, n.didnt_go_well, n.next_change)
     is not distinct from (r.date, r.kind, r.went_well, r.didnt_go_well, r.next_change) then
    return r;
  end if;
  update public.reflections set date = n.date, kind = n.kind, went_well = n.went_well,
    didnt_go_well = n.didnt_go_well, next_change = n.next_change, updated_at = harada_private.now_ms()
  where id = r.id returning * into n;
  return n;
end;
$$;

/** {reflectionId} */
create function public.delete_reflection(p_input jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  v_id uuid := harada_private.req_uuid(p_input, 'reflectionId');
begin
  delete from public.reflections where id = v_id;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile
-- ---------------------------------------------------------------------------

/** {displayName?, timeZone?} */
create function public.update_profile(p_input jsonb)
returns public.profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  v_name text := harada_private.txt(p_input, 'displayName', 80);
  v_tz text := harada_private.txt(p_input, 'timeZone', 64);
  r public.profiles;
begin
  if v_name is null and v_tz is null then perform harada_private.fail('VALIDATION', 'Nothing to update'); end if;
  if v_name = '' then perform harada_private.fail('VALIDATION', 'Required', 'displayName'); end if;
  if v_tz is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    perform harada_private.fail('VALIDATION', 'Unknown time zone', 'timeZone');
  end if;
  update public.profiles set display_name = coalesce(v_name, display_name), time_zone = coalesce(v_tz, time_zone),
    updated_at = harada_private.now_ms()
  where id = v_uid returning * into r;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: RPCs callable only by signed-in users; helpers only from inside them.
-- ---------------------------------------------------------------------------
revoke all on all functions in schema harada_private from public, anon;
grant execute on all functions in schema harada_private to authenticated;
alter default privileges in schema harada_private revoke execute on functions from public;

do $$
declare
  f text;
begin
  foreach f in array array[
    'create_goal', 'update_goal', 'activate_goal', 'mark_goal_achieved', 'reopen_goal', 'archive_goal',
    'restore_goal', 'delete_goal', 'add_outcome', 'update_outcome', 'update_measure_current',
    'archive_outcome', 'restore_outcome', 'reorder_outcomes', 'add_action', 'update_action',
    'complete_action', 'reopen_action', 'check_routine', 'uncheck_routine', 'archive_action',
    'restore_action', 'move_action', 'reorder_actions', 'add_to_today', 'remove_from_today',
    'add_reflection', 'update_reflection', 'delete_reflection', 'update_profile'
  ] loop
    execute format('revoke all on function public.%I(jsonb) from public, anon', f);
    execute format('grant execute on function public.%I(jsonb) to authenticated', f);
  end loop;
end
$$;

alter default privileges in schema public revoke execute on functions from public, anon;
