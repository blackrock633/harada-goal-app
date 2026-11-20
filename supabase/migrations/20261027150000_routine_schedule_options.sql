-- More routine schedules: on chosen days of the month, or on specific dates.
--
--   monthly  {type: 'monthly', daysOfMonth: [1..31]}  stored in schedule_days. A day past the end of a short month
--            falls on that month's last day (the 31st means "the last day" in April).
--   dates    {type: 'dates', dates: ['YYYY-MM-DD', ...]} (1 to 60) stored in the new schedule_dates column.
--
-- Independent of every other pending migration. parse_schedule keeps its signature; insert_action and
-- update_action are restated only to carry schedule_dates (marked "-- new" below).

alter table public.actions add column schedule_dates date[];

alter table public.actions drop constraint actions_schedule_type_check;
alter table public.actions add constraint actions_schedule_type_check check (
  schedule_type is null or schedule_type in ('daily', 'weekdays', 'weekly', 'monthly', 'dates'));

alter table public.actions drop constraint actions_schedule_shape_check;
alter table public.actions add constraint actions_schedule_shape_check check (
  (schedule_type is null and schedule_days is null and schedule_times_per_week is null and schedule_dates is null)
  or (schedule_type = 'daily' and schedule_days is null and schedule_times_per_week is null and schedule_dates is null)
  or (schedule_type = 'weekdays' and schedule_times_per_week is null and schedule_dates is null
      and cardinality(schedule_days) between 1 and 7 and schedule_days <@ array[0,1,2,3,4,5,6]::smallint[])
  or (schedule_type = 'weekly' and schedule_days is null and schedule_dates is null
      and schedule_times_per_week between 1 and 7)
  or (schedule_type = 'monthly' and schedule_times_per_week is null and schedule_dates is null
      and cardinality(schedule_days) between 1 and 31
      and schedule_days <@ '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31}'::smallint[])
  or (schedule_type = 'dates' and schedule_days is null and schedule_times_per_week is null
      and cardinality(schedule_dates) between 1 and 60)
);

/** Schedule → normalised columns (dates are read separately by parse_schedule_dates). */
create or replace function harada_private.parse_schedule(
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
  elsif o_type = 'monthly' then
    if jsonb_typeof(s -> 'daysOfMonth') <> 'array' or jsonb_array_length(s -> 'daysOfMonth') not between 1 and 31 then
      perform harada_private.fail('VALIDATION', 'Pick at least one day of the month', 'schedule');
    end if;
    if exists (select 1 from jsonb_array_elements(s -> 'daysOfMonth') d
               where jsonb_typeof(d) <> 'number' or d::text::numeric <> trunc(d::text::numeric)
                  or d::text::numeric not between 1 and 31) then
      perform harada_private.fail('VALIDATION', 'Days of the month are 1 to 31', 'schedule');
    end if;
    select array_agg(distinct d::text::smallint order by d::text::smallint) into o_days
      from jsonb_array_elements(s -> 'daysOfMonth') d;
  elsif o_type = 'dates' then
    perform harada_private.parse_schedule_dates(s);
  else
    perform harada_private.fail('VALIDATION', 'Invalid schedule type', 'schedule');
  end if;
end;
$$;

/** The sorted, distinct dates of a {type: 'dates'} schedule (1 to 60); null for any other type. */
create function harada_private.parse_schedule_dates(s jsonb)
returns date[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v date[];
begin
  if jsonb_typeof(s) <> 'object' or s ->> 'type' is distinct from 'dates' then return null; end if;
  if jsonb_typeof(s -> 'dates') <> 'array' then
    perform harada_private.fail('VALIDATION', 'Pick at least one date', 'schedule');
  end if;
  if exists (select 1 from jsonb_array_elements(s -> 'dates') d
             where jsonb_typeof(d) <> 'string' or (d #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$') then
    perform harada_private.fail('VALIDATION', 'Use dates like 2026-11-01', 'schedule');
  end if;
  begin
    select array_agg(distinct (d #>> '{}')::date order by (d #>> '{}')::date) into v
      from jsonb_array_elements(s -> 'dates') d;
  exception when others then
    perform harada_private.fail('VALIDATION', 'Use dates like 2026-11-01', 'schedule');
  end;
  if coalesce(cardinality(v), 0) not between 1 and 60 then
    perform harada_private.fail('VALIDATION', 'Pick between 1 and 60 dates', 'schedule');
  end if;
  return v;
end;
$$;

revoke all on function harada_private.parse_schedule_dates(jsonb) from public, anon;
grant execute on function harada_private.parse_schedule_dates(jsonb) to authenticated;

create or replace function harada_private.insert_action(
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
  v_dates date[]; -- new
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
    v_dates := harada_private.parse_schedule_dates(a -> 'schedule'); -- new
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
                              schedule_days, schedule_times_per_week, schedule_dates, start_date, created_at, updated_at)
  values (v_id, p_goal_id, p_outcome_id, v_title, v_notes, v_kind, v_pos, v_due, v_type, v_days, v_times,
          v_dates, v_start, p_now, p_now)
  returning * into r;
  return r;
end;
$$;

/** {actionId, expectedUpdatedAt?, title?, notes?, kind?, dueDate?, schedule?} */
create or replace function public.update_action(p_input jsonb)
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
  v_dates date[]; -- new
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
      v_dates := harada_private.parse_schedule_dates(p_input -> 'schedule'); -- new
      if (v_type, v_days, v_times, v_dates)
         is distinct from (n.schedule_type, n.schedule_days, n.schedule_times_per_week, n.schedule_dates) then -- new
        n.schedule_type := v_type; n.schedule_days := v_days; n.schedule_times_per_week := v_times;
        n.schedule_dates := v_dates; -- new
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
    n.schedule_dates := null; -- new
    n.start_date := null;
  end if;
  if cardinality(v_changed) = 0 then return a; end if;
  update public.actions set title = n.title, notes = n.notes, kind = n.kind, due_date = n.due_date,
    completed_at = n.completed_at, schedule_type = n.schedule_type, schedule_days = n.schedule_days,
    schedule_times_per_week = n.schedule_times_per_week, schedule_dates = n.schedule_dates, -- new
    start_date = n.start_date,
    updated_at = harada_private.now_ms()
  where id = a.id returning * into n;
  perform harada_private.event(g.id, 'action_updated', a.id, 'Updated action: ' || array_to_string(v_changed, ', '),
    jsonb_build_object('changed', to_jsonb(v_changed)));
  return n;
end;
$$;
