-- QA SEC-01 + P3 findings on 20261020120000_rpc_write_path.sql.
--
-- SEC-01: `harada.write_path` was set for the rest of the transaction, so a client surface that runs several
-- operations in one transaction (e.g. a multi-field pg_graphql mutation) could follow an RPC with a direct
-- write. Each public RPC is now a thin wrapper: it calls the implementation (moved to harada_private as
-- <name>_impl) and switches the flag off again before returning, so the flag spans exactly one RPC body.
-- An error aborts the whole transaction, so no "finally" is needed.
--
-- P3: unique/exclusion/not-null/check/format errors from an RPC now surface as HG409/HG400 without
-- constraint names (a foreign client id no longer reveals which table it exists in); measures are capped;
-- `has()` tolerates non-object input; oversized raw text is rejected before trimming.

create function harada_private.end_write()
returns void
language sql
set search_path = ''
as $$ select set_config('harada.write_path', 'off', true); $$;

-- Input helpers -------------------------------------------------------------
create or replace function harada_private.has(p jsonb, k text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select jsonb_typeof(p) = 'object' and p ? k and jsonb_typeof(p -> k) <> 'null' $$;

create or replace function harada_private.txt(p jsonb, k text, max_len int, required boolean default false)
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
  -- Bound the work before trimming: whitespace-only megabytes are rejected, not trimmed to ''.
  if char_length(p ->> k) > max_len + 1000 then
    perform harada_private.fail('VALIDATION', format('Keep it under %s characters', max_len), k);
  end if;
  v := regexp_replace(p ->> k, '^\s+|\s+$', '', 'g');
  if required and v = '' then perform harada_private.fail('VALIDATION', 'Required', k); end if;
  if char_length(v) > max_len then
    perform harada_private.fail('VALIDATION', format('Keep it under %s characters', max_len), k);
  end if;
  return v;
end;
$$;

create or replace function harada_private.parse_measure(
  m jsonb, out o_target numeric, out o_current numeric, out o_unit text)
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(m) <> 'object' then perform harada_private.fail('VALIDATION', 'Invalid measure', 'measure'); end if;
  o_target := harada_private.num(m, 'target', 'measure.target');
  if o_target <= 0 then perform harada_private.fail('VALIDATION', 'Target must be greater than 0', 'measure.target'); end if;
  if o_target > 1e12 then perform harada_private.fail('VALIDATION', 'Target is too large', 'measure.target'); end if;
  o_current := case when harada_private.has(m, 'current') then harada_private.num(m, 'current', 'measure.current') else 0 end;
  if o_current < 0 then perform harada_private.fail('VALIDATION', 'Cannot be negative', 'measure.current'); end if;
  if o_current > 1e12 then perform harada_private.fail('VALIDATION', 'Value is too large', 'measure.current'); end if;
  o_unit := coalesce(harada_private.txt(m, 'unit', 24), '');
end;
$$;

-- update_measure_current reads `current` directly; cap it there too.
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
  if abs((p ->> k)::numeric) > 1e12 then perform harada_private.fail('VALIDATION', 'Value is too large', field); end if;
  return (p ->> k)::numeric;
end;
$$;

-- Wrappers -----------------------------------------------------------------------------------------
-- Moves public.<name>(jsonb) to harada_private.<name>_impl(jsonb) (grants travel with it) and creates the
-- public wrapper. The wrapper bodies are fixed SQL text; this DO block only runs at migration time.
do $$
declare
  f record;
  v_ret text;
  v_body text;
  v_path text := current_setting('search_path');
begin
  -- Empty search_path so format_type() schema-qualifies the row types used in the wrapper bodies.
  perform pg_catalog.set_config('search_path', '', true);
  for f in
    select p.proname as name, pg_catalog.format_type(p.prorettype, null) as rettype, p.proretset as retset
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      'create_goal', 'update_goal', 'activate_goal', 'mark_goal_achieved', 'reopen_goal', 'archive_goal',
      'restore_goal', 'delete_goal', 'add_outcome', 'update_outcome', 'update_measure_current',
      'archive_outcome', 'restore_outcome', 'reorder_outcomes', 'add_action', 'update_action',
      'complete_action', 'reopen_action', 'check_routine', 'uncheck_routine', 'archive_action',
      'restore_action', 'move_action', 'reorder_actions', 'add_to_today', 'remove_from_today',
      'add_reflection', 'update_reflection', 'delete_reflection', 'update_profile'])
  loop
    execute format('alter function public.%I(jsonb) set schema harada_private', f.name);
    execute format('alter function harada_private.%I(jsonb) rename to %I', f.name, f.name || '_impl');

    if f.retset then
      v_ret := 'setof ' || f.rettype;
      v_body := format('return query select * from harada_private.%I(p_input);
  perform harada_private.end_write();
  return;', f.name || '_impl');
    elsif f.rettype = 'void' then
      v_ret := 'void';
      v_body := format('perform harada_private.%I(p_input);
  perform harada_private.end_write();', f.name || '_impl');
    else
      v_ret := f.rettype;
      v_body := format('r := harada_private.%I(p_input);
  perform harada_private.end_write();
  return r;', f.name || '_impl');
    end if;

    execute format($fn$
create function public.%1$I(p_input jsonb)
returns %2$s
language plpgsql
security invoker
set search_path = ''
as $body$
declare
  r %3$s;
begin
  %4$s
exception
  when unique_violation or exclusion_violation then
    perform harada_private.fail('CONFLICT', 'This was changed elsewhere — reload');
  when not_null_violation or check_violation or invalid_text_representation or numeric_value_out_of_range then
    perform harada_private.fail('VALIDATION', 'Invalid input');
end;
$body$;
revoke all on function public.%1$I(jsonb) from public, anon;
grant execute on function public.%1$I(jsonb) to authenticated;
$fn$, f.name, v_ret, case when f.rettype = 'void' then 'int' else f.rettype end, v_body);
  end loop;
  perform pg_catalog.set_config('search_path', v_path, true);
end
$$;

revoke all on all functions in schema harada_private from public, anon;
grant execute on all functions in schema harada_private to authenticated;
