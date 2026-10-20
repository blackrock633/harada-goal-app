-- Daily focus: actions the user explicitly picked to work on for a given local date (D-016).
-- Independent of due dates and routine schedules, which still drive the derived "next" list.
-- The 5-per-day cap is enforced here by slot uniqueness, so concurrent adds can't exceed it.

create table public.daily_focus (
  id uuid primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  action_id uuid not null references public.actions (id) on delete cascade,
  date date not null,
  slot smallint not null,
  created_at timestamptz not null default now(),
  constraint daily_focus_slot_check check (slot between 0 and 4),
  constraint daily_focus_action_date_unique unique (action_id, date),
  constraint daily_focus_owner_date_slot_unique unique (owner_id, date, slot)
);

create index daily_focus_owner_date_idx on public.daily_focus (owner_id, date);

revoke all on public.daily_focus from anon;
grant select, insert, delete on public.daily_focus to authenticated;

alter table public.daily_focus enable row level security;

create policy daily_focus_select_own on public.daily_focus
  for select to authenticated using (owner_id = (select auth.uid()));
-- Both the row owner and the action's owner must be the current user.
create policy daily_focus_insert_own on public.daily_focus
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.owns_action(action_id)));
create policy daily_focus_delete_own on public.daily_focus
  for delete to authenticated using (owner_id = (select auth.uid()));
