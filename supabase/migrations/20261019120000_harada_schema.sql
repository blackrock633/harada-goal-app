-- Harada Goal App — canonical schema for Supabase (Postgres 15+).
--
-- Replaces the pre-Supabase drizzle/0000_init.sql, which was only ever applied to local PGlite
-- dev/test databases (no production data existed). See docs/DATABASE.md and DECISIONS D-013.
--
-- Identity: Supabase Auth owns credentials (auth.users). public.profiles holds app-level profile data
-- keyed by the same id. Every user-owned row is reachable from profiles.id via goals.owner_id.
--
-- Security: RLS is enabled on every table. Ownership is always resolved from goals.owner_id = auth.uid().
-- The Next.js server runs each unit of work as the `authenticated` role with the verified user's JWT
-- claims (see src/infrastructure/db/unit-of-work.ts), so these policies apply to server queries too.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  time_zone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_len_check check (char_length(display_name) between 1 and 80),
  constraint profiles_time_zone_len_check check (char_length(time_zone) between 1 and 64)
);

-- Creates the profile row when Supabase Auth creates a user. Values come from the sign-up metadata
-- (`options.data` = { display_name, time_zone }) and are sanitised here because metadata is client-supplied.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  v_tz text := coalesce(new.raw_user_meta_data ->> 'time_zone', 'UTC');
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
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------------
create table public.goals (
  id uuid primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  vision text not null default '',
  success_criteria text not null default '',
  target_date date,
  status text not null,
  status_before_archive text,
  purpose_self_tangible text not null default '',
  purpose_self_intangible text not null default '',
  purpose_others_tangible text not null default '',
  purpose_others_intangible text not null default '',
  activated_on date,
  achieved_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_title_len_check check (char_length(title) between 1 and 120),
  constraint goals_vision_len_check check (char_length(vision) <= 2000),
  constraint goals_success_criteria_len_check check (char_length(success_criteria) <= 2000),
  constraint goals_purpose_len_check check (
    char_length(purpose_self_tangible) <= 1000 and char_length(purpose_self_intangible) <= 1000
    and char_length(purpose_others_tangible) <= 1000 and char_length(purpose_others_intangible) <= 1000
  ),
  constraint goals_status_check check (status in ('draft', 'active', 'achieved', 'archived')),
  constraint goals_status_before_archive_check check (
    status_before_archive is null or status_before_archive in ('draft', 'active', 'achieved')
  ),
  constraint goals_archive_consistency_check check (
    (status = 'archived') = (archived_at is not null and status_before_archive is not null)
  ),
  constraint goals_achieved_consistency_check check (
    achieved_at is null or status in ('achieved', 'archived')
  )
);

create index goals_owner_status_idx on public.goals (owner_id, status);

-- ---------------------------------------------------------------------------
-- outcomes (the 8 key areas around the central goal)
-- ---------------------------------------------------------------------------
create table public.outcomes (
  id uuid primary key,
  goal_id uuid not null references public.goals (id) on delete cascade,
  title text not null,
  description text not null default '',
  measure_target numeric,
  measure_current numeric,
  measure_unit text,
  position smallint,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outcomes_title_len_check check (char_length(title) between 1 and 120),
  constraint outcomes_description_len_check check (char_length(description) <= 1000),
  constraint outcomes_measure_check check (
    (measure_target is null and measure_current is null and measure_unit is null)
    or (measure_target is not null and measure_current is not null and measure_unit is not null
        and measure_target > 0 and measure_current >= 0 and char_length(measure_unit) <= 24)
  ),
  constraint outcomes_position_check check (position between 0 and 7),
  constraint outcomes_position_archive_check check ((position is null) = (archived_at is not null)),
  -- Target of the composite FK from actions, guaranteeing an action's goal_id matches its outcome's goal.
  constraint outcomes_id_goal_unique unique (id, goal_id),
  -- Unique active position per goal. An exclusion constraint (rather than a partial unique index) so it can
  -- be DEFERRED inside a reorder transaction; positions 0..7 + uniqueness also cap active outcomes at 8.
  constraint outcomes_goal_position_excl exclude using btree (goal_id with =, position with =)
    where (archived_at is null) deferrable initially immediate
);

create index outcomes_goal_idx on public.outcomes (goal_id);

-- ---------------------------------------------------------------------------
-- actions (8 per outcome; empty matrix cells are simply absent rows)
-- ---------------------------------------------------------------------------
create table public.actions (
  id uuid primary key,
  goal_id uuid not null references public.goals (id) on delete cascade,
  outcome_id uuid not null,
  title text not null,
  notes text not null default '',
  kind text not null,
  position smallint,
  due_date date,
  completed_at timestamptz,
  schedule_type text,
  schedule_days smallint[],
  schedule_times_per_week smallint,
  start_date date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint actions_outcome_same_goal_fk foreign key (outcome_id, goal_id)
    references public.outcomes (id, goal_id) on delete cascade,
  constraint actions_title_len_check check (char_length(title) between 1 and 160),
  constraint actions_notes_len_check check (char_length(notes) <= 2000),
  constraint actions_kind_check check (kind in ('task', 'routine')),
  constraint actions_position_check check (position between 0 and 7),
  constraint actions_position_archive_check check ((position is null) = (archived_at is not null)),
  constraint actions_schedule_type_check check (
    schedule_type is null or schedule_type in ('daily', 'weekdays', 'weekly')
  ),
  constraint actions_schedule_shape_check check (
    (schedule_type is null and schedule_days is null and schedule_times_per_week is null)
    or (schedule_type = 'daily' and schedule_days is null and schedule_times_per_week is null)
    or (schedule_type = 'weekdays' and schedule_times_per_week is null
        and cardinality(schedule_days) between 1 and 7 and schedule_days <@ array[0,1,2,3,4,5,6]::smallint[])
    or (schedule_type = 'weekly' and schedule_days is null and schedule_times_per_week between 1 and 7)
  ),
  constraint actions_kind_consistency_check check (
    (kind = 'task' and schedule_type is null and start_date is null)
    or (kind = 'routine' and schedule_type is not null and start_date is not null
        and due_date is null and completed_at is null)
  ),
  constraint actions_outcome_position_excl exclude using btree (outcome_id with =, position with =)
    where (archived_at is null) deferrable initially immediate
);

create index actions_goal_idx on public.actions (goal_id);
create index actions_outcome_idx on public.actions (outcome_id);

-- ---------------------------------------------------------------------------
-- routine_checks (one fact per routine per local date)
-- ---------------------------------------------------------------------------
create table public.routine_checks (
  id uuid primary key,
  action_id uuid not null references public.actions (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  constraint routine_checks_action_date_unique unique (action_id, date)
);

-- ---------------------------------------------------------------------------
-- reflections (per goal; daily or weekly)
-- ---------------------------------------------------------------------------
create table public.reflections (
  id uuid primary key,
  goal_id uuid not null references public.goals (id) on delete cascade,
  date date not null,
  kind text not null,
  went_well text not null default '',
  didnt_go_well text not null default '',
  next_change text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reflections_kind_check check (kind in ('daily', 'weekly')),
  constraint reflections_fields_len_check check (
    char_length(went_well) <= 4000 and char_length(didnt_go_well) <= 4000 and char_length(next_change) <= 4000
  )
);

create index reflections_goal_date_idx on public.reflections (goal_id, date desc);

-- ---------------------------------------------------------------------------
-- goal_events (append-only history: completions, reopenings, structural edits)
-- ---------------------------------------------------------------------------
create table public.goal_events (
  id uuid primary key,
  goal_id uuid not null references public.goals (id) on delete cascade,
  type text not null,
  subject_id uuid,
  summary text not null,
  data jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

create index goal_events_goal_time_idx on public.goal_events (goal_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Ownership helpers
-- SECURITY DEFINER so the lookup on goals/actions isn't itself re-filtered by RLS (cheaper, no recursion).
-- They only answer "does the CURRENT user own X?", so they leak nothing.
-- ---------------------------------------------------------------------------
create function public.owns_goal(p_goal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.goals g
    where g.id = p_goal_id and g.owner_id = (select auth.uid())
  );
$$;

create function public.owns_action(p_action_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.actions a
    join public.goals g on g.id = a.goal_id
    where a.id = p_action_id and g.owner_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_goal(uuid) from public, anon;
revoke all on function public.owns_action(uuid) from public, anon;
grant execute on function public.owns_goal(uuid) to authenticated;
grant execute on function public.owns_action(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants: nothing for anon; CRUD for authenticated (RLS narrows it to owned rows).
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.goals, public.outcomes, public.actions,
  public.routine_checks, public.reflections, public.goal_events from anon;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.goals, public.outcomes, public.actions,
  public.routine_checks, public.reflections to authenticated;
grant select, insert on public.goal_events to authenticated;
revoke update, delete on public.goal_events from authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.outcomes enable row level security;
alter table public.actions enable row level security;
alter table public.routine_checks enable row level security;
alter table public.reflections enable row level security;
alter table public.goal_events enable row level security;

-- profiles: own row only. Inserted by the auth trigger; deleted by cascade from auth.users.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- goals
create policy goals_select_own on public.goals
  for select to authenticated using (owner_id = (select auth.uid()));
create policy goals_insert_own on public.goals
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy goals_update_own on public.goals
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- Archive-before-delete is enforced here, not just in the UI.
create policy goals_delete_own_archived on public.goals
  for delete to authenticated using (owner_id = (select auth.uid()) and status = 'archived');

-- outcomes
create policy outcomes_select_own on public.outcomes
  for select to authenticated using ((select public.owns_goal(goal_id)));
create policy outcomes_insert_own on public.outcomes
  for insert to authenticated with check ((select public.owns_goal(goal_id)));
create policy outcomes_update_own on public.outcomes
  for update to authenticated
  using ((select public.owns_goal(goal_id))) with check ((select public.owns_goal(goal_id)));
create policy outcomes_delete_own on public.outcomes
  for delete to authenticated using ((select public.owns_goal(goal_id)));

-- actions (the composite FK already ties outcome_id to the same goal)
create policy actions_select_own on public.actions
  for select to authenticated using ((select public.owns_goal(goal_id)));
create policy actions_insert_own on public.actions
  for insert to authenticated with check ((select public.owns_goal(goal_id)));
create policy actions_update_own on public.actions
  for update to authenticated
  using ((select public.owns_goal(goal_id))) with check ((select public.owns_goal(goal_id)));
create policy actions_delete_own on public.actions
  for delete to authenticated using ((select public.owns_goal(goal_id)));

-- routine_checks
create policy routine_checks_select_own on public.routine_checks
  for select to authenticated using ((select public.owns_action(action_id)));
create policy routine_checks_insert_own on public.routine_checks
  for insert to authenticated with check ((select public.owns_action(action_id)));
create policy routine_checks_delete_own on public.routine_checks
  for delete to authenticated using ((select public.owns_action(action_id)));

-- reflections
create policy reflections_select_own on public.reflections
  for select to authenticated using ((select public.owns_goal(goal_id)));
create policy reflections_insert_own on public.reflections
  for insert to authenticated with check ((select public.owns_goal(goal_id)));
create policy reflections_update_own on public.reflections
  for update to authenticated
  using ((select public.owns_goal(goal_id))) with check ((select public.owns_goal(goal_id)));
create policy reflections_delete_own on public.reflections
  for delete to authenticated using ((select public.owns_goal(goal_id)));

-- goal_events: append-only for the owner (no update/delete policies or grants).
create policy goal_events_select_own on public.goal_events
  for select to authenticated using ((select public.owns_goal(goal_id)));
create policy goal_events_insert_own on public.goal_events
  for insert to authenticated with check ((select public.owns_goal(goal_id)));
