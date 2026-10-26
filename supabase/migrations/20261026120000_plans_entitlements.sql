-- Harada Pro: plans, prices, subscriptions and the one entitlement check (docs/PREMIUM_SYSTEM.md).
--
-- Source of truth: `harada_private.plan_of(user)` decides Free or Pro from `subscriptions` (written only by the
-- Stripe webhook, with the service role) and `plan_grants` (complimentary/test access, written only by an
-- operator). Every premium rule in the database asks `harada_private.has_feature()`; clients only display the
-- answer of `public.get_my_plan()` and never decide access themselves.
--
-- Limits and prices are rows, not constants: change `plans.max_active_goals` or a `prices` row to change the
-- offer. Stripe stays authoritative for what is charged (billing-checkout refuses a price whose Stripe amount
-- differs from the row it displays).
--
-- New tables are written only by SECURITY DEFINER functions or the service role: `authenticated` gets SELECT
-- (own rows) at most, so there is no write path for a client to abuse.

-- Error code for "this needs Pro": HG402 (the clients show an upgrade prompt, never a generic error).
create or replace function harada_private.fail(p_code text, p_message text, p_field text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = case p_code
      when 'VALIDATION' then 'HG400' when 'UNAUTHENTICATED' then 'HG401' when 'UPGRADE_REQUIRED' then 'HG402'
      when 'FORBIDDEN' then 'HG403' when 'NOT_FOUND' then 'HG404'
      when 'CONFLICT' then 'HG409' when 'INVALID_STATE' then 'HG422' when 'LIMIT_REACHED' then 'HG429'
      else 'HG500' end,
    message = p_message,
    hint = coalesce(p_field, '');
end;
$$;

-- The RPC allow-list of begin_write() (SEC-DB-01) becomes a table, so a migration that adds a write RPC
-- registers it with one insert instead of restating the whole function.
create table harada_private.write_rpcs (name text primary key);
revoke all on harada_private.write_rpcs from public, anon, authenticated;
insert into harada_private.write_rpcs (name) values
  ('create_goal'), ('update_goal'), ('activate_goal'), ('mark_goal_achieved'), ('reopen_goal'), ('archive_goal'),
  ('restore_goal'), ('delete_goal'), ('add_outcome'), ('update_outcome'), ('update_measure_current'),
  ('archive_outcome'), ('restore_outcome'), ('reorder_outcomes'), ('add_action'), ('update_action'),
  ('complete_action'), ('reopen_action'), ('check_routine'), ('uncheck_routine'), ('archive_action'),
  ('restore_action'), ('move_action'), ('reorder_actions'), ('add_to_today'), ('remove_from_today'),
  ('add_reflection'), ('update_reflection'), ('delete_reflection'), ('update_profile'),
  ('choose_active_goal');

/** True when `p_name` is a registered write RPC; SECURITY DEFINER so the table needs no client grant. */
create function harada_private.is_write_rpc(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from harada_private.write_rpcs where name = p_name) $$;

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
  get diagnostics v_stack = pg_context;
  v_outer := (regexp_split_to_array(v_stack, E'\n'))[array_length(regexp_split_to_array(v_stack, E'\n'), 1)];
  if not harada_private.is_write_rpc(coalesce(substring(v_outer from '^PL/pgSQL function public\.([a-z_]+)\(jsonb\) '), '')) then
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

-- ---------------------------------------------------------------------------
-- Plans, features, prices (public catalogue)
-- ---------------------------------------------------------------------------
create table public.plans (
  id text primary key,
  name text not null,
  /** Active (not draft/achieved/archived) goals a user on this plan may have at once; null = no limit. */
  max_active_goals integer,
  constraint plans_id_check check (id in ('free', 'pro')),
  constraint plans_max_active_goals_check check (max_active_goals is null or max_active_goals >= 1)
);

create table public.plan_features (
  plan_id text not null references public.plans (id) on delete cascade,
  feature text not null,
  primary key (plan_id, feature),
  constraint plan_features_feature_check check (feature in (
    'multiple_goals', 'progress_history', 'advanced_reviews', 'premium_templates', 'ai_planning', 'insights'))
);

create table public.prices (
  id text primary key,
  plan_id text not null references public.plans (id),
  amount_cents integer not null,
  currency text not null default 'usd',
  billing_interval text not null,
  /** Stripe Price id (price_...). Null until configured; checkout refuses an unconfigured price. */
  stripe_price_id text unique,
  active boolean not null default true,
  sort_order smallint not null default 0,
  constraint prices_amount_check check (amount_cents > 0),
  constraint prices_interval_check check (billing_interval in ('month', 'year')),
  constraint prices_currency_check check (currency ~ '^[a-z]{3}$')
);

insert into public.plans (id, name, max_active_goals) values
  ('free', 'Free', 1),
  ('pro', 'Harada Pro', null);

insert into public.plan_features (plan_id, feature) values
  ('pro', 'multiple_goals'), ('pro', 'progress_history'), ('pro', 'advanced_reviews'),
  ('pro', 'premium_templates'), ('pro', 'ai_planning'), ('pro', 'insights');

insert into public.prices (id, plan_id, amount_cents, billing_interval, sort_order) values
  ('pro_monthly', 'pro', 799, 'month', 1),
  ('pro_annual', 'pro', 4999, 'year', 2);

alter table public.plans enable row level security;
alter table public.plan_features enable row level security;
alter table public.prices enable row level security;
create policy plans_read on public.plans for select to anon, authenticated using (true);
create policy plan_features_read on public.plan_features for select to anon, authenticated using (true);
create policy prices_read on public.prices for select to anon, authenticated using (active);
revoke all on public.plans, public.plan_features, public.prices from public, anon, authenticated;
grant select on public.plans, public.plan_features to anon, authenticated;
-- The Stripe price id is configuration, not something a client needs.
grant select (id, plan_id, amount_cents, currency, billing_interval, active, sort_order) on public.prices to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Subscriptions (mirror of Stripe, written by the webhook only)
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  /** Stripe subscription status: incomplete, incomplete_expired, trialing, active, past_due, canceled, unpaid, paused. */
  status text not null,
  price_id text references public.prices (id),
  /** What Stripe actually charges per interval after discounts, as last reported (for MRR). */
  amount_cents integer,
  billing_interval text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  /** Stripe's event time of the last applied change; older events never overwrite newer state. */
  stripe_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_status_check check (status in (
    'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused', 'none')),
  constraint subscriptions_interval_check check (billing_interval is null or billing_interval in ('month', 'year'))
);

create index subscriptions_status_idx on public.subscriptions (status);

/** Every Stripe event applied, by id: a redelivered event is acknowledged and skipped. */
create table public.billing_events (
  id text primary key,
  type text not null,
  user_id uuid references public.profiles (id) on delete set null,
  received_at timestamptz not null default now()
);

/** Complimentary or test access granted by an operator (SQL editor / service role). */
create table public.plan_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id text not null references public.plans (id),
  reason text not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index plan_grants_user_idx on public.plan_grants (user_id);

alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.plan_grants enable row level security;
revoke all on public.subscriptions, public.billing_events, public.plan_grants from public, anon, authenticated;
-- Users read their own plan through get_my_plan(); no direct table access, so Stripe ids stay server-side.

-- ---------------------------------------------------------------------------
-- The entitlement check
-- ---------------------------------------------------------------------------
/**
 * 'pro' while a Stripe subscription is active or trialing and inside its paid period (a cancelled subscription
 * keeps access until the period it was paid for ends), during a 3-day grace window after a failed renewal
 * (past_due, while Stripe retries), or under an unexpired grant. Otherwise 'free'.
 */
create function harada_private.plan_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
      select 1 from public.subscriptions s
      where s.user_id = p_user
        and (
          (s.status in ('active', 'trialing') and (s.current_period_end is null or s.current_period_end > now()))
          or (s.status = 'past_due' and s.current_period_end > now() - interval '3 days')
        )
    ) or exists (
      select 1 from public.plan_grants g
      where g.user_id = p_user and g.plan_id = 'pro' and g.starts_at <= now()
        and (g.expires_at is null or g.expires_at > now())
    ) then 'pro' else 'free' end
$$;

create function harada_private.has_feature(p_user uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.plan_features f where f.plan_id = harada_private.plan_of(p_user) and f.feature = p_feature)
$$;

/** For the caller only (auth.uid()), so it reveals nothing about anyone else's plan. */
create function harada_private.require_feature(p_feature text, p_message text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not harada_private.has_feature(auth.uid(), p_feature) then
    perform harada_private.fail('UPGRADE_REQUIRED', p_message, p_feature);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Free plan: one active goal (enforced for every write path: RPCs and the web server)
-- ---------------------------------------------------------------------------
create function harada_private.enforce_active_goal_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_active integer;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then
    return new;
  end if;
  select p.max_active_goals into v_max from public.plans p where p.id = harada_private.plan_of(new.owner_id);
  if v_max is null then return new; end if;
  -- Serialise concurrent activations by the same owner.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('active_goals:' || new.owner_id::text, 0));
  select count(*) into v_active from public.goals g
  where g.owner_id = new.owner_id and g.status = 'active' and g.id <> new.id;
  if v_active >= v_max then
    perform harada_private.fail('UPGRADE_REQUIRED',
      'The Free plan has one active goal. Upgrade to Harada Pro to work on several at once.', 'multiple_goals');
  end if;
  return new;
end;
$$;

create trigger goals_active_limit before insert or update of status on public.goals
  for each row execute function harada_private.enforce_active_goal_limit();

-- ---------------------------------------------------------------------------
-- Client API
-- ---------------------------------------------------------------------------
/** The caller's plan, features and limits, and whether they are over the Free limit after a downgrade. */
create function public.get_my_plan()
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
    'subscription', case when s.user_id is null then null else jsonb_build_object(
      'status', s.status,
      'priceId', s.price_id,
      'currentPeriodEnd', s.current_period_end,
      'cancelAtPeriodEnd', s.cancel_at_period_end,
      'hasBillingAccount', s.stripe_customer_id is not null) end,
    'grant', (select jsonb_build_object('expiresAt', g.expires_at) from public.plan_grants g
              where g.user_id = v_uid and g.plan_id = 'pro' and g.starts_at <= now()
                and (g.expires_at is null or g.expires_at > now())
              order by g.expires_at desc nulls first limit 1)
  );
end;
$$;

revoke all on function public.get_my_plan() from public, anon;
grant execute on function public.get_my_plan() to authenticated;

-- The entitlement helpers are internal; the default grant in harada_private would expose plan_of(any user).
revoke all on function harada_private.plan_of(uuid), harada_private.has_feature(uuid, text),
  harada_private.enforce_active_goal_limit()
  from public, anon, authenticated;
revoke all on function harada_private.require_feature(text, text) from public, anon;
grant execute on function harada_private.require_feature(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- After a downgrade: keep one goal active, archive the others (restorable, nothing is deleted)
-- ---------------------------------------------------------------------------
/** {goalId}: the goal to keep active. Every other active goal of the caller is archived. */
create function public.choose_active_goal(p_input jsonb)
returns setof public.goals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  v_keep uuid := harada_private.req_uuid(p_input, 'goalId');
  g public.goals;
begin
  select * into g from public.goals where id = v_keep;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  if g.status <> 'active' then perform harada_private.fail('INVALID_STATE', 'Choose one of your active goals'); end if;
  for g in select * from public.goals where owner_id = v_uid and status = 'active' and id <> v_keep order by created_at loop
    perform harada_private.transition_goal(jsonb_build_object('goalId', g.id), 'archive');
  end loop;
  perform harada_private.end_write();
  return query select * from public.goals where owner_id = v_uid order by created_at;
end;
$$;

revoke all on function public.choose_active_goal(jsonb) from public, anon;
grant execute on function public.choose_active_goal(jsonb) to authenticated;
