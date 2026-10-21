-- Parity with the TypeScript use cases, found by rpc-parity.rls.test.ts (same script through both paths).
--
-- restore_action: the web app refuses when the action's key area is archived, whether or not the action
-- itself is archived ("Restore the outcome first"); the RPC returned a no-op for a live action. Same order now.

create or replace function harada_private.restore_action_impl(p_input jsonb)
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
  if exists (select 1 from public.outcomes o where o.id = a.outcome_id and o.archived_at is not null) then
    perform harada_private.fail('INVALID_STATE', 'Restore the outcome first, then restore this action');
  end if;
  if a.archived_at is null then return a; end if;
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
