-- Hardening after the QA RLS review (H1, H3).
--
-- H1: Supabase's default privileges give anon/authenticated ALL on new public tables, including
-- TRUNCATE (which bypasses RLS), TRIGGER and REFERENCES. Replace them with exact per-table grants.

revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, time_zone, updated_at) on public.profiles to authenticated;

grant select, insert, update, delete on public.goals, public.outcomes, public.actions, public.reflections
  to authenticated;
grant select, insert, delete on public.routine_checks, public.daily_focus to authenticated;
grant select, insert on public.goal_events to authenticated;

-- H3: routine checks only make sense for routine actions.
create function public.routine_checks_require_routine()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only reject visible task actions; an invisible (other user's) action is left for RLS to reject.
  if exists (select 1 from public.actions a where a.id = new.action_id and a.kind <> 'routine') then
    raise exception 'routine checks are only allowed on routine actions'
      using errcode = '23514', constraint = 'routine_checks_routine_only';
  end if;
  return new;
end;
$$;

revoke all on function public.routine_checks_require_routine() from public, anon, authenticated;

create trigger routine_checks_routine_only
  before insert or update of action_id on public.routine_checks
  for each row execute function public.routine_checks_require_routine();

comment on column public.goal_events.subject_id is
  'Untrusted label written by the owner (the id the event is about). Not a foreign key; never use it for authorization or joins across goals.';
