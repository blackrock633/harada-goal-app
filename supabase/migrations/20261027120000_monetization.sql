alter table public.subscriptions add column billing_environment text not null default 'SANDBOX' check(billing_environment in ('SANDBOX','PRODUCTION'));
alter table public.subscriptions add column sync_generation bigint not null default 0;
alter table public.subscriptions add column revoked boolean not null default false;
alter table public.subscriptions add column paid_through timestamptz;
update public.subscriptions set paid_through=current_period_end where status in ('active','trialing');
-- Provider-specific mirrors feed one effective entitlement; clients cannot write any source.
-- Retain configured old prices for existing subscribers; new checkout uses the new catalogue rows.
do $$ declare p public.prices; begin
 for p in select * from public.prices where id in ('pro_monthly','pro_annual') loop
  update public.prices set stripe_price_id=null, amount_cents=case p.id when 'pro_monthly' then 399 else 2999 end where id=p.id;
  if p.stripe_price_id is not null then
   insert into public.prices(id,plan_id,amount_cents,currency,billing_interval,stripe_price_id,active,sort_order)
   values(p.id||'_legacy_20261027',p.plan_id,p.amount_cents,p.currency,p.billing_interval,p.stripe_price_id,false,p.sort_order);
  end if;
 end loop;
end $$;

alter table public.plan_grants add column revoked_at timestamptz;
alter table public.plan_grants add column granted_by uuid references public.profiles(id) on delete set null;
alter table public.plan_grants add column revoked_by uuid references public.profiles(id) on delete set null;
create table public.founding_members (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 member_number integer not null unique check(member_number between 1 and 100),
 approved_by uuid references public.profiles(id) on delete set null, approved_at timestamptz not null default now()
);
create table public.entitlement_audit (
 id bigint generated always as identity primary key, actor uuid,
 user_id uuid references public.profiles(id) on delete set null, action text not null, reason text not null,
 grant_id uuid references public.plan_grants(id) on delete set null, occurred_at timestamptz not null default now()
);
create table public.billing_settings (
 singleton boolean primary key default true check(singleton), environment text not null default 'SANDBOX'
 check(environment in ('SANDBOX','PRODUCTION')), founding_complimentary_pro boolean not null default false
);
insert into public.billing_settings default values;
create table public.native_subscriptions (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 product_id text, store text, expires_at timestamptz, status text not null,
 cancel_at_period_end boolean not null default false,
 environment text not null check(environment in ('SANDBOX','PRODUCTION')),
 synced_at timestamptz not null, generation bigint not null
);
create sequence harada_private.billing_generation;
create table public.native_billing_events (id text primary key, received_at timestamptz not null default now());
alter table public.founding_members enable row level security;
alter table public.entitlement_audit enable row level security;
alter table public.billing_settings enable row level security;
alter table public.native_subscriptions enable row level security;
alter table public.native_billing_events enable row level security;
revoke all on public.founding_members, public.entitlement_audit, public.billing_settings,
 public.native_subscriptions, public.native_billing_events from public, anon, authenticated;

create function public.admin_entitlement(p_user uuid, p_action text, p_reason text, p_grant uuid default null, p_expires timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_id uuid; v_number integer;
begin
 if not public.am_i_admin() then perform harada_private.fail('FORBIDDEN','Administrator required'); end if;
 if length(trim(coalesce(p_reason,''))) < 3 or length(p_reason)>500 then
 perform harada_private.fail('VALIDATION','An audit reason is required'); end if;
 if p_action = 'founding' then
  perform pg_advisory_xact_lock(100271);
  if exists(select 1 from public.founding_members where user_id=p_user) then
   perform harada_private.fail('CONFLICT','Already a Founding Member'); end if;
  select coalesce(max(member_number),0)+1 into v_number from public.founding_members;
  if v_number>100 then perform harada_private.fail('LIMIT_REACHED','Founding 100 is full'); end if;
  insert into public.founding_members(user_id,member_number,approved_by) values(p_user,v_number,v_actor);
  if (select founding_complimentary_pro from public.billing_settings) then
   insert into public.plan_grants(user_id,plan_id,reason,granted_by) values(p_user,'pro',p_reason,v_actor) returning id into v_id;
  end if;
 elsif p_action='grant' then
  if p_expires <= now() then perform harada_private.fail('VALIDATION','Expiry must be in the future'); end if;
  insert into public.plan_grants(user_id,plan_id,reason,granted_by,expires_at)
   values(p_user,'pro',p_reason,v_actor,p_expires) returning id into v_id;
 elsif p_action='revoke' then
  update public.plan_grants set revoked_at=now(),revoked_by=v_actor
   where id=p_grant and user_id=p_user and revoked_at is null returning id into v_id;
  if v_id is null then perform harada_private.fail('NOT_FOUND','Active grant not found'); end if;
 else perform harada_private.fail('VALIDATION','Unknown entitlement action'); end if;
 insert into public.entitlement_audit(actor,user_id,action,reason,grant_id) values(v_actor,p_user,p_action,p_reason,v_id);
 return v_id;
end $$;
revoke all on function public.admin_entitlement(uuid,text,text,uuid,timestamptz) from public,anon;
grant execute on function public.admin_entitlement(uuid,text,text,uuid,timestamptz) to authenticated;

-- Allocate ordering BEFORE fetching provider state; late responses cannot overwrite newer fetches.
create function public.billing_next_generation() returns bigint language sql security definer set search_path='' as $$
 select nextval('harada_private.billing_generation') $$;
create function public.native_billing_apply(p_user uuid,p_event text,p_generation bigint,p_state jsonb)
returns text language plpgsql security definer set search_path='' as $$
begin
 if p_state->>'environment' is distinct from (select environment from public.billing_settings) then
 raise exception 'Billing environment mismatch'; end if;
 perform pg_advisory_xact_lock(hashtextextended('native_billing:'||p_user::text,0));
 insert into public.native_billing_events(id) values(p_event) on conflict do nothing;
 if not found then return 'duplicate'; end if;
 insert into public.native_subscriptions as n(user_id,product_id,store,expires_at,status,cancel_at_period_end,environment,synced_at,generation)
 values(p_user,p_state->>'productId',p_state->>'store',(p_state->>'expiresAt')::timestamptz,
 p_state->>'status',coalesce((p_state->>'cancelAtPeriodEnd')::boolean,false),p_state->>'environment',now(),p_generation)
 on conflict(user_id) do update set product_id=excluded.product_id,store=excluded.store,expires_at=excluded.expires_at,
 status=excluded.status,cancel_at_period_end=excluded.cancel_at_period_end,environment=excluded.environment,
 synced_at=excluded.synced_at,generation=excluded.generation where n.generation<excluded.generation;
 return 'applied';
end $$;
revoke all on function public.billing_next_generation(),public.native_billing_apply(uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.billing_next_generation(),public.native_billing_apply(uuid,text,bigint,jsonb) to service_role;

create or replace function harada_private.plan_of(p_user uuid) returns text language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.subscriptions where user_id=p_user
 and billing_environment=(select environment from public.billing_settings) and not revoked and price_id is not null and ((status in ('active','trialing') and current_period_end>now())
 or (status='past_due' and paid_through>now())))
 or exists(select 1 from public.native_subscriptions n where n.user_id=p_user
 and n.status in ('active','grace_period') and n.expires_at>now()
 and n.environment=(select environment from public.billing_settings))
 or exists(select 1 from public.plan_grants where user_id=p_user and plan_id='pro' and revoked_at is null
 and starts_at<=now() and (expires_at is null or expires_at>now())) then 'pro' else 'free' end $$;

-- Basic weekly reflections stay Free. Existing advanced records remain readable after downgrade.
create or replace function harada_private.check_reflection_access(p_id uuid) returns void
 language plpgsql stable security definer set search_path='' as $$ begin return; end $$;
drop policy reflections_select_own on public.reflections;
create policy reflections_select_own on public.reflections for select to authenticated using ((select public.owns_goal(goal_id)));
create or replace function harada_private.enforce_review_entitlement() returns trigger
 language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
 if new.kind='monthly' or new.answers<>'{}'::jsonb then
 select owner_id into v_owner from public.goals where id=new.goal_id;
 if not harada_private.has_feature(v_owner,'advanced_reviews') then
 perform harada_private.fail('UPGRADE_REQUIRED','Structured advanced reviews require Harada Pro','advanced_reviews'); end if;
 end if; return new;
end $$;

-- Deterministic downgrade: oldest active goal stays editable; all other data remains readable.
create function harada_private.enforce_downgrade_write() returns trigger
 language plpgsql security definer set search_path='' as $$
declare v_goal uuid; v_owner uuid; v_first uuid; v_status text;
begin
 if tg_table_name='goals' then
  v_goal:=old.id;
  -- Allow archive/achievement/delete so users can resolve their limit without paying.
  if tg_op='DELETE' or new.status<>'active' then return new; end if;
 elsif tg_table_name in ('routine_checks','daily_focus') then
  select goal_id into v_goal from public.actions where id=coalesce(new.action_id,old.action_id);
 else v_goal:=coalesce(new.goal_id,old.goal_id); end if;
 select owner_id,status into v_owner,v_status from public.goals where id=v_goal;
 if v_status='active' and harada_private.plan_of(v_owner)='free' then
 select id into v_first from public.goals where owner_id=v_owner and status='active' order by created_at,id limit 1;
 if v_goal<>v_first then perform harada_private.fail('UPGRADE_REQUIRED',
 'Choose one active goal or restore Pro to edit this goal. Your data is preserved.','multiple_goals'); end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger downgrade_goal before update on public.goals for each row execute function harada_private.enforce_downgrade_write();
create trigger downgrade_action before insert or update or delete on public.actions for each row execute function harada_private.enforce_downgrade_write();
create trigger downgrade_outcome before insert or update or delete on public.outcomes for each row execute function harada_private.enforce_downgrade_write();
create trigger downgrade_reflection before insert or update or delete on public.reflections for each row execute function harada_private.enforce_downgrade_write();
create trigger downgrade_focus before insert on public.daily_focus for each row execute function harada_private.enforce_downgrade_write();
create trigger downgrade_routine before insert or update or delete on public.routine_checks for each row execute function harada_private.enforce_downgrade_write();
revoke all on function harada_private.enforce_downgrade_write() from public,anon,authenticated;

create or replace function public.get_my_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  s public.subscriptions;
  v_active integer;
  v_max integer;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  v_plan := harada_private.plan_of(v_uid);
  select * into s from public.subscriptions where user_id = v_uid;
  select count(*) into v_active from public.goals where owner_id = v_uid and status = 'active';
  select max_active_goals into v_max from public.plans where id = v_plan;
  return jsonb_build_object(
    'plan', v_plan,
    'features', coalesce((select jsonb_agg(f.feature order by f.feature) from public.plan_features f where f.plan_id = v_plan), '[]'::jsonb),
    'maxActiveGoals', v_max,
    'activeGoals', v_active,
    'overLimit', v_max is not null and v_active > v_max,
    'nativeSubscription', (select jsonb_build_object('status',n.status,'store',n.store,'currentPeriodEnd',n.expires_at,'cancelAtPeriodEnd',n.cancel_at_period_end) from public.native_subscriptions n where n.user_id=v_uid),
    'foundingMember', exists(select 1 from public.founding_members where user_id=v_uid),
    'subscription', case when s.user_id is null then null else jsonb_build_object(
      'status', s.status,
      'priceId', s.price_id,
      'currentPeriodEnd', s.current_period_end,
      'cancelAtPeriodEnd', s.cancel_at_period_end,
      'hasBillingAccount', s.stripe_customer_id is not null) end,
    'grant', (select jsonb_build_object('expiresAt', g.expires_at) from public.plan_grants g
              where g.revoked_at is null and g.user_id = v_uid and g.plan_id = 'pro' and g.starts_at <= now()
                and (g.expires_at is null or g.expires_at > now())
              order by g.expires_at desc nulls first limit 1)
  );
end;
$$;


-- Harden the existing Stripe adapter without giving clients another entitlement write path.
alter function public.billing_apply(jsonb) rename to billing_apply_internal;
revoke all on function public.billing_apply_internal(jsonb) from public,anon,authenticated,service_role;
create function public.billing_apply(p_event jsonb) returns text language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_result text; v_generation bigint; s public.subscriptions;
begin
 if p_event ? 'livemode' and (p_event->>'livemode')::boolean is distinct from
 ((select environment from public.billing_settings)='PRODUCTION') then raise exception 'Billing environment mismatch'; end if;
 select * into s from public.subscriptions where stripe_customer_id=p_event->>'customerId';
 v_user:=s.user_id;
 if v_user is null then raise exception 'Unknown billing customer; retry after customer linkage'; end if;
 if p_event->>'userId' is not null and p_event->>'userId'<>v_user::text then raise exception 'Customer ownership mismatch'; end if;
 perform pg_advisory_xact_lock(hashtextextended('stripe_billing:'||v_user::text,0));
 select * into s from public.subscriptions where user_id=v_user for update;
 if exists(select 1 from public.billing_events where id=p_event->>'eventId') then return 'duplicate'; end if;
 v_generation:=coalesce((p_event->>'generation')::bigint,0);
 if v_generation>0 and v_generation<=s.sync_generation then return 'ignored'; end if;
 if p_event->>'status' in ('active','trialing','past_due') and not exists(
 select 1 from public.prices where stripe_price_id=p_event->>'stripePriceId') then raise exception 'Unrecognized subscription price'; end if;
 if s.stripe_subscription_id is not null and s.stripe_subscription_id<>p_event->>'subscriptionId'
 and s.status not in ('none','canceled','incomplete_expired') then raise exception 'Conflicting subscription'; end if;
 -- Fresh authoritative snapshots are ordered by fetch generation, not webhook creation time.
 if v_generation>0 then p_event:=p_event||jsonb_build_object('created',extract(epoch from greatest(now(),s.stripe_updated_at))); end if;
 v_result:=public.billing_apply_internal(p_event);
 if v_result='applied' and p_event->>'status' is not null then
 update public.subscriptions set sync_generation=greatest(sync_generation,v_generation),
 billing_environment=case when (p_event->>'livemode')::boolean then 'PRODUCTION' else 'SANDBOX' end,
 paid_through=case when p_event->>'status' in ('active','trialing') then to_timestamp((p_event->>'currentPeriodEnd')::double precision) else paid_through end,
 revoked=case when p_event->>'revoked'='true' then true
 when p_event->>'revoked'='false' then false
 when p_event->>'eventType'='invoice.paid' and (p_event->>'currentPeriodEnd')::double precision>extract(epoch from s.current_period_end) then false
 else revoked end where user_id=v_user;
 end if;
 return v_result;
end $$;
revoke all on function public.billing_apply(jsonb) from public,anon,authenticated;
grant execute on function public.billing_apply(jsonb) to service_role;

-- Public profile UUIDs must not double as guessable RevenueCat identities.
create table harada_private.billing_identities (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 app_user_id uuid not null unique default gen_random_uuid()
);
revoke all on harada_private.billing_identities from public,anon,authenticated;
create function public.my_billing_identity() returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; begin
 if auth.uid() is null then perform harada_private.fail('UNAUTHENTICATED','Please sign in'); end if;
 insert into harada_private.billing_identities(user_id) values(auth.uid()) on conflict do nothing;
 select app_user_id into v_id from harada_private.billing_identities where user_id=auth.uid(); return v_id;
end $$;
create function public.billing_identity_for(p_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; begin
 insert into harada_private.billing_identities(user_id) values(p_user) on conflict do nothing;
 select app_user_id into v_id from harada_private.billing_identities where user_id=p_user; return v_id;
end $$;
create function public.billing_user_for(p_identity uuid) returns uuid language sql stable security definer set search_path='' as $$
 select user_id from harada_private.billing_identities where app_user_id=p_identity $$;
revoke all on function public.my_billing_identity() from public,anon;
grant execute on function public.my_billing_identity() to authenticated;
revoke all on function public.billing_identity_for(uuid),public.billing_user_for(uuid) from public,anon,authenticated;
grant execute on function public.billing_identity_for(uuid),public.billing_user_for(uuid) to service_role;

create table harada_private.checkout_attempts (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 price_id text not null references public.prices(id), attempt uuid not null default gen_random_uuid(),
 expires_at timestamptz not null default now()+interval '1 hour'
);
revoke all on harada_private.checkout_attempts from public,anon,authenticated;
create function public.billing_checkout_attempt(p_user uuid,p_price text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a harada_private.checkout_attempts;
begin
 perform pg_advisory_xact_lock(hashtextextended('checkout:'||p_user::text,0));
 insert into harada_private.checkout_attempts as t(user_id,price_id) values(p_user,p_price)
 on conflict(user_id) do update set price_id=excluded.price_id,attempt=excluded.attempt,expires_at=excluded.expires_at
 where t.expires_at < now();
 select * into a from harada_private.checkout_attempts where user_id=p_user;
 if a.price_id<>p_price then perform harada_private.fail('CONFLICT','A checkout is already open for another plan. Complete it or wait for it to expire in one hour.'); end if;
 return jsonb_build_object('key',a.attempt,'expiresAt',floor(extract(epoch from a.expires_at)));
end $$;
revoke all on function public.billing_checkout_attempt(uuid,text) from public,anon,authenticated;
grant execute on function public.billing_checkout_attempt(uuid,text) to service_role;

create table harada_private.billing_sync_requests(user_id uuid primary key references public.profiles(id) on delete cascade,last_requested timestamptz not null);
create table harada_private.billing_reconciliations(user_id uuid primary key references public.profiles(id) on delete cascade,last_synced timestamptz not null);
revoke all on harada_private.billing_sync_requests,harada_private.billing_reconciliations from public,anon,authenticated;
create function public.billing_claim_sync(p_user uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 insert into harada_private.billing_sync_requests as t(user_id,last_requested) values(p_user,now())
 on conflict(user_id) do update set last_requested=now() where t.last_requested<now()-interval '30 seconds';
 return found;
end $$;
create function public.billing_reconcile_users() returns setof uuid language sql security definer set search_path='' as $$
 select u.user_id from (select user_id from public.subscriptions union select user_id from public.native_subscriptions) u
 left join harada_private.billing_reconciliations r on r.user_id=u.user_id
 where r.last_synced is null or r.last_synced<now()-interval '1 hour'
 order by r.last_synced nulls first,u.user_id limit 20 $$;
create function public.billing_mark_reconciled(p_user uuid) returns void language sql security definer set search_path='' as $$
 insert into harada_private.billing_reconciliations(user_id,last_synced) values(p_user,now())
 on conflict(user_id) do update set last_synced=now() $$;
revoke all on function public.billing_claim_sync(uuid),public.billing_reconcile_users(),public.billing_mark_reconciled(uuid) from public,anon,authenticated;
grant execute on function public.billing_claim_sync(uuid),public.billing_reconcile_users(),public.billing_mark_reconciled(uuid) to service_role;

-- Provider lifecycle telemetry is distinct from untrusted UI analytics. Financial totals stay with providers.
create table public.billing_lifecycle_events (
 id bigint generated always as identity primary key, user_id uuid references public.profiles(id) on delete set null,
 provider text not null, kind text not null, occurred_at timestamptz not null default now()
);
alter table public.billing_lifecycle_events enable row level security;
revoke all on public.billing_lifecycle_events from public,anon,authenticated;
create function harada_private.record_billing_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
declare v_kind text; v_period timestamptz; v_old_period timestamptz;
begin
 if tg_table_name='subscriptions' then v_period:=new.current_period_end;
 if tg_op='UPDATE' then v_old_period:=old.current_period_end; end if;
 else v_period:=new.expires_at; if tg_op='UPDATE' then v_old_period:=old.expires_at; end if; end if;
 if tg_op='INSERT' then
  if new.status in ('active','trialing','grace_period') then v_kind:='activated'; end if;
 elsif old.status<>new.status then
  v_kind:=case when new.status in ('active','trialing','grace_period') then 'activated'
  when new.status in ('past_due','unpaid') then 'payment_failed' when new.status in ('canceled','expired','revoked') then 'ended' else 'status_changed' end;
 elsif new.cancel_at_period_end and not old.cancel_at_period_end then v_kind:='cancellation_scheduled';
 elsif not new.cancel_at_period_end and old.cancel_at_period_end then v_kind:='reactivated';
 elsif new.status in ('active','trialing') and v_period>v_old_period then v_kind:='renewed'; end if;
 if v_kind is not null then insert into public.billing_lifecycle_events(user_id,provider,kind)
 values(new.user_id,case when tg_table_name='subscriptions' then 'stripe' else 'revenuecat' end,v_kind); end if;
 return new;
end $$;
create trigger stripe_lifecycle after insert or update on public.subscriptions for each row execute function harada_private.record_billing_lifecycle();
create trigger native_lifecycle after insert or update on public.native_subscriptions for each row execute function harada_private.record_billing_lifecycle();
revoke all on function harada_private.record_billing_lifecycle() from public,anon,authenticated;

create function public.billing_environment() returns text language sql stable security definer set search_path='' as $$
 select environment from public.billing_settings $$;
revoke all on function public.billing_environment() from public,anon,authenticated;
grant execute on function public.billing_environment() to service_role;
