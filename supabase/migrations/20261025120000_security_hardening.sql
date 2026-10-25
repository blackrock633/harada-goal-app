-- Security audit hardening (docs/SECURITY_AUDIT.md).
--
-- SEC-DB-01: `authenticated` can EXECUTE every harada_private function (the SECURITY INVOKER wrappers need it),
-- so a client that can reach harada_private directly could call begin_write() — or an *_impl, which skips the
-- wrapper's end_write() — and then write tables directly in the same transaction, skipping every RPC rule
-- (RLS still blocks cross-user writes). Unreachable today (harada_private is not an exposed API schema and
-- PostgREST runs one call per transaction), but one dashboard setting away. begin_write() now refuses unless
-- the outermost frame of the call stack is one of the public RPC wrappers, which always close the write path.
--
-- SEC-DB-02: measure numbers were capped in magnitude, not in digits; a 16,000-digit fraction was stored and
-- copied into a goal_events summary on every call.
--
-- SEC-EDGE-01: per-user attempt counter for the delete-account Edge Function's password re-check, callable
-- only with the service role.

-- SEC-DB-01 ---------------------------------------------------------------------------------------------
create or replace function harada_private.begin_write(p_input jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_stack text;
  v_outer text;
begin
  -- The trusted server UnitOfWork sets the flag itself and never calls this, so only client RPCs reach here.
  get diagnostics v_stack = pg_context;
  v_outer := (regexp_split_to_array(v_stack, E'\n'))[array_length(regexp_split_to_array(v_stack, E'\n'), 1)];
  if coalesce(substring(v_outer from '^PL/pgSQL function public\.([a-z_]+)\(jsonb\) '), '') <> all (array[
      'create_goal', 'update_goal', 'activate_goal', 'mark_goal_achieved', 'reopen_goal', 'archive_goal',
      'restore_goal', 'delete_goal', 'add_outcome', 'update_outcome', 'update_measure_current',
      'archive_outcome', 'restore_outcome', 'reorder_outcomes', 'add_action', 'update_action',
      'complete_action', 'reopen_action', 'check_routine', 'uncheck_routine', 'archive_action',
      'restore_action', 'move_action', 'reorder_actions', 'add_to_today', 'remove_from_today',
      'add_reflection', 'update_reflection', 'delete_reflection', 'update_profile']) then
    raise exception 'Call the public RPC functions' using errcode = '42501';
  end if;
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform harada_private.fail('VALIDATION', 'Invalid input');
  end if;
  perform set_config('harada.write_path', 'on', true);
  return v_uid;
end;
$$;

-- Nobody but the migration owner creates objects in public (PG15+ default; explicit for older projects).
revoke create on schema public from public, anon, authenticated;

-- SEC-DB-02 ---------------------------------------------------------------------------------------------
create or replace function harada_private.num(p jsonb, k text, field text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not harada_private.has(p, k) or jsonb_typeof(p -> k) <> 'number' then
    perform harada_private.fail('VALIDATION', 'Must be a number', field);
  end if;
  -- A JS double prints in at most ~24 characters; anything longer is not from a real client.
  if char_length(p ->> k) > 32 then perform harada_private.fail('VALIDATION', 'Too many digits', field); end if;
  if abs((p ->> k)::numeric) > 1e12 then perform harada_private.fail('VALIDATION', 'Value is too large', field); end if;
  return (p ->> k)::numeric;
end;
$$;

-- SEC-EDGE-01 -------------------------------------------------------------------------------------------
create table harada_private.password_attempts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_start timestamptz not null,
  attempts integer not null
);
alter table harada_private.password_attempts enable row level security;
revoke all on harada_private.password_attempts from public, anon, authenticated;

/** Counts one password re-check for `p_user_id`; false once 5 were made in the current 15-minute window. */
create function public.consume_password_attempt(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  insert into harada_private.password_attempts as t (user_id, window_start, attempts)
  values (p_user_id, now(), 1)
  on conflict (user_id) do update set
    window_start = case when t.window_start < now() - interval '15 minutes' then now() else t.window_start end,
    attempts = case when t.window_start < now() - interval '15 minutes' then 1 else t.attempts + 1 end
  returning attempts into v_attempts;
  return v_attempts <= 5;
end;
$$;

revoke all on function public.consume_password_attempt(uuid) from public, anon, authenticated;
grant execute on function public.consume_password_attempt(uuid) to service_role;
