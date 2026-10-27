-- First-party product analytics, the Stripe → subscriptions write path, and the admin metrics (docs/PREMIUM_SYSTEM.md).
--
-- Analytics: events carry a name from a fixed list and a few properties whose values are numbers, booleans or
-- short enum-like tokens ([a-z0-9_]). Free text cannot be stored at all, so goal titles, reflections, notes,
-- emails or payment details can never end up in analytics, whatever a client sends. No third party receives it.
--
-- Billing: the stripe-webhook Edge Function verifies the Stripe signature, normalises the event and calls
-- billing_apply() with the service role. billing_apply is idempotent on the Stripe event id and ignores
-- events older than the state it already holds.
--
-- Admin: `admins` lists operators (inserted by hand in the SQL editor). admin_metrics() checks that list on the
-- server; there is no client-side role flag.

-- ---------------------------------------------------------------------------
-- Analytics
-- ---------------------------------------------------------------------------
create table public.analytics_events (
  id bigint generated always as identity primary key,
  name text not null,
  user_id uuid references public.profiles (id) on delete set null,
  /** Random per-install id for visitors who are not signed in (never derived from personal data). */
  anon_id text,
  props jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint analytics_name_check check (name in (
    'landing_page_viewed', 'signup_started', 'signup_completed', 'onboarding_started', 'goal_created',
    'supporting_area_created', 'first_action_created', 'first_action_completed', 'weekly_review_completed',
    'challenge_joined', 'challenge_day_completed', 'challenge_completed', 'progress_card_generated',
    'share_link_created', 'shared_page_viewed', 'referral_signup_completed', 'upgrade_page_viewed',
    'upgrade_prompt_shown', 'checkout_started', 'subscription_activated', 'subscription_cancelled',
    'premium_feature_used')),
  constraint analytics_anon_id_check check (anon_id is null or anon_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint analytics_props_check check (jsonb_typeof(props) = 'object' and char_length(props::text) <= 1000)
);

create index analytics_name_time_idx on public.analytics_events (name, occurred_at desc);
create index analytics_user_idx on public.analytics_events (user_id, occurred_at desc);
create index analytics_anon_idx on public.analytics_events (anon_id, occurred_at desc) where anon_id is not null;

alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from public, anon, authenticated;

/**
 * Records one event for the caller (or an anonymous visitor). Unknown names, unknown property keys and
 * free-text values are rejected; bursts beyond 120 events per hour per user/visitor are dropped silently.
 */
create function public.track_event(p_name text, p_props jsonb default '{}'::jsonb, p_anon_id text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  k text;
  v jsonb;
begin
  -- Server-side events are recorded by the database itself and cannot be sent by a client.
  if p_name in ('subscription_activated', 'subscription_cancelled', 'referral_signup_completed', 'challenge_joined',
                'share_link_created') then
    perform harada_private.fail('VALIDATION', 'Recorded by the server', 'name');
  end if;
  if p_props is null then p_props := '{}'::jsonb; end if;
  if jsonb_typeof(p_props) <> 'object' then perform harada_private.fail('VALIDATION', 'Invalid properties', 'props'); end if;
  for k, v in select key, value from jsonb_each(p_props) loop
    if k <> all (array['source', 'platform', 'plan', 'price', 'interval', 'kind', 'format', 'feature', 'template_tier',
                        'step', 'day', 'count', 'weeks', 'referred']) then
      perform harada_private.fail('VALIDATION', 'Unknown property', 'props');
    end if;
    if not (jsonb_typeof(v) in ('number', 'boolean')
            or (jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[a-z0-9_]{1,32}$')) then
      perform harada_private.fail('VALIDATION', 'Properties must be numbers, booleans or short tokens', 'props');
    end if;
  end loop;
  if v_uid is null and (p_anon_id is null or p_anon_id !~ '^[A-Za-z0-9_-]{8,64}$') then
    perform harada_private.fail('VALIDATION', 'Missing visitor id', 'anonId');
  end if;
  if (select count(*) from public.analytics_events e
      where e.occurred_at > now() - interval '1 hour'
        and ((v_uid is not null and e.user_id = v_uid) or (v_uid is null and e.anon_id = p_anon_id))) >= 120 then
    return;
  end if;
  insert into public.analytics_events (name, user_id, anon_id, props)
  values (p_name, v_uid, case when v_uid is null then p_anon_id end, p_props);
end;
$$;

revoke all on function public.track_event(text, jsonb, text) from public;
grant execute on function public.track_event(text, jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Billing write path (service role only)
-- ---------------------------------------------------------------------------
/**
 * Links a Stripe customer to a user before checkout, so the webhook can find the user even if Stripe's
 * metadata were lost. Creates the subscriptions row in status 'none' when the user has none yet.
 */
create function public.billing_link_customer(p_user uuid, p_customer text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.subscriptions (user_id, stripe_customer_id, status, stripe_updated_at)
  values (p_user, p_customer, 'none', 'epoch')
  on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id, updated_at = now()
  where public.subscriptions.stripe_customer_id is null;
$$;

/** The Stripe customer of a user (for checkout and the billing portal), or null. */
create function public.billing_customer_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select s.stripe_customer_id from public.subscriptions s where s.user_id = p_user $$;

/**
 * Applies one normalised Stripe event (see supabase/functions/_shared/stripe.ts):
 *   {eventId, eventType, created (epoch s), userId?, customerId, subscriptionId?, status?, stripePriceId?,
 *    amountCents?, interval?, currentPeriodEnd? (epoch s), cancelAtPeriodEnd?, canceledAt? (epoch s)}
 * Returns 'duplicate' for an event already applied, 'ignored' when no user can be matched or the event is
 * older than the stored state, else 'applied'.
 */
create function public.billing_apply(p_event jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_created timestamptz := to_timestamp((p_event ->> 'created')::double precision);
  v_user uuid;
  v_before text;
  v_after text;
  s public.subscriptions;
  v_cancel_before boolean;
begin
  if (p_event ->> 'eventId') is null or (p_event ->> 'customerId') is null then
    raise exception 'billing_apply: eventId and customerId are required';
  end if;
  insert into public.billing_events (id, type) values (p_event ->> 'eventId', p_event ->> 'eventType')
  on conflict (id) do nothing;
  if not found then return 'duplicate'; end if;

  select user_id into v_user from public.subscriptions
  where stripe_customer_id = p_event ->> 'customerId'
     or (p_event ->> 'subscriptionId' is not null and stripe_subscription_id = p_event ->> 'subscriptionId')
  limit 1;
  if v_user is null and (p_event ->> 'userId') ~ '^[0-9a-f-]{36}$' then
    select id into v_user from public.profiles where id = (p_event ->> 'userId')::uuid;
  end if;
  if v_user is null then return 'ignored'; end if;
  update public.billing_events set user_id = v_user where id = p_event ->> 'eventId';

  -- An invoice or checkout event without subscription state only records the event.
  if (p_event ->> 'status') is null then return 'applied'; end if;

  select * into s from public.subscriptions where user_id = v_user for update;
  if found and s.stripe_updated_at > v_created then return 'ignored'; end if;
  v_before := harada_private.plan_of(v_user);
  v_cancel_before := coalesce(s.cancel_at_period_end, false) or coalesce(s.status, '') = 'canceled';

  insert into public.subscriptions as t (user_id, stripe_customer_id, stripe_subscription_id, status, price_id,
    amount_cents, billing_interval, current_period_end, cancel_at_period_end, canceled_at, stripe_updated_at)
  values (v_user, p_event ->> 'customerId', p_event ->> 'subscriptionId', p_event ->> 'status',
    (select pr.id from public.prices pr where pr.stripe_price_id = p_event ->> 'stripePriceId'),
    (p_event ->> 'amountCents')::integer, p_event ->> 'interval',
    to_timestamp((p_event ->> 'currentPeriodEnd')::double precision),
    coalesce((p_event ->> 'cancelAtPeriodEnd')::boolean, false),
    to_timestamp((p_event ->> 'canceledAt')::double precision), v_created)
  on conflict (user_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = coalesce(excluded.stripe_subscription_id, t.stripe_subscription_id),
    status = excluded.status,
    price_id = coalesce(excluded.price_id, t.price_id),
    amount_cents = coalesce(excluded.amount_cents, t.amount_cents),
    billing_interval = coalesce(excluded.billing_interval, t.billing_interval),
    current_period_end = coalesce(excluded.current_period_end, t.current_period_end),
    cancel_at_period_end = excluded.cancel_at_period_end,
    canceled_at = excluded.canceled_at,
    stripe_updated_at = excluded.stripe_updated_at,
    updated_at = now();

  v_after := harada_private.plan_of(v_user);
  if v_before = 'free' and v_after = 'pro' then
    insert into public.analytics_events (name, user_id, props)
    values ('subscription_activated', v_user, jsonb_build_object('interval', coalesce(p_event ->> 'interval', 'month')));
    update public.referrals set converted_at = now() where referred_id = v_user and converted_at is null;
  end if;
  if not v_cancel_before and (coalesce((p_event ->> 'cancelAtPeriodEnd')::boolean, false) or p_event ->> 'status' = 'canceled') then
    insert into public.analytics_events (name, user_id, props) values ('subscription_cancelled', v_user, '{}'::jsonb);
  end if;
  return 'applied';
end;
$$;

revoke all on function public.billing_link_customer(uuid, text), public.billing_customer_of(uuid),
  public.billing_apply(jsonb) from public, anon, authenticated;
grant execute on function public.billing_link_customer(uuid, text), public.billing_customer_of(uuid),
  public.billing_apply(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- AI usage quota (service role only; used by the ai-plan Edge Function)
-- ---------------------------------------------------------------------------
create table harada_private.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  requests integer not null,
  primary key (user_id, day)
);
revoke all on harada_private.ai_usage from public, anon, authenticated;

/** Counts one AI request for the user today (UTC); false once `p_limit` were made. */
create function public.consume_ai_request(p_user uuid, p_limit integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  insert into harada_private.ai_usage as u (user_id, day, requests) values (p_user, (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, day) do update set requests = u.requests + 1
  returning requests into v;
  return v <= p_limit;
end;
$$;

/** Whether a user has a feature, for Edge Functions that act with the service role on a verified user. */
create function public.user_has_feature(p_user uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select harada_private.has_feature(p_user, p_feature) $$;

revoke all on function public.consume_ai_request(uuid, integer), public.user_has_feature(uuid, text)
  from public, anon, authenticated;
grant execute on function public.consume_ai_request(uuid, integer), public.user_has_feature(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Admin metrics
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from public, anon, authenticated;

create function public.am_i_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.admins a where a.user_id = auth.uid()) $$;

/**
 * Business metrics for operators. Counts come from the application tables themselves; revenue comes from the
 * subscription state Stripe last reported (amount after discounts, per interval), never from summed payments.
 */
create function public.admin_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_users integer;
  v_paid_ever integer;
begin
  if not public.am_i_admin() then perform harada_private.fail('FORBIDDEN', 'Not allowed'); end if;
  select count(*) into v_users from public.profiles;
  select count(*) into v_paid_ever from public.subscriptions where status not in ('none', 'incomplete', 'incomplete_expired');
  return jsonb_build_object(
    'generatedAt', now(),
    'users', jsonb_build_object(
      'total', v_users,
      'withGoal', (select count(distinct owner_id) from public.goals),
      'withFirstCompletion', (select count(distinct g.owner_id) from public.goals g
         where exists (select 1 from public.actions a where a.goal_id = g.id and a.completed_at is not null)
            or exists (select 1 from public.routine_checks c join public.actions a on a.id = c.action_id where a.goal_id = g.id)),
      'weeklyActive', (select count(distinct owner_id) from (
          select g.owner_id from public.goal_events e join public.goals g on g.id = e.goal_id where e.occurred_at > now() - interval '7 days'
          union select g.owner_id from public.routine_checks c join public.actions a on a.id = c.action_id
            join public.goals g on g.id = a.goal_id where c.created_at > now() - interval '7 days'
          union select g.owner_id from public.reflections r join public.goals g on g.id = r.goal_id where r.created_at > now() - interval '7 days'
        ) x),
      'newByWeek', (select coalesce(jsonb_agg(jsonb_build_object('week', w.ws, 'count',
          (select count(*) from public.profiles p where p.created_at >= w.ws and p.created_at < w.ws + interval '7 days'))
          order by w.ws), '[]'::jsonb)
        from (select date_trunc('week', now()) - make_interval(weeks => i) as ws from generate_series(0, 11) i) w)),
    'challenge', jsonb_build_object(
      'joined', (select count(*) from public.challenge_enrollments),
      'active', (select count(*) from public.challenge_enrollments where status = 'active'),
      'completed', (select count(*) from public.challenge_enrollments where status = 'completed'),
      'left', (select count(*) from public.challenge_enrollments where status = 'left')),
    'sharing', jsonb_build_object(
      'cardsGenerated', (select count(*) from public.analytics_events where name = 'progress_card_generated'),
      'linksCreated', (select count(*) from public.share_links),
      'linkViews', (select coalesce(sum(view_count), 0) from public.share_links),
      'referralSignups', (select count(*) from public.referrals),
      'referralConversions', (select count(*) from public.referrals where converted_at is not null)),
    'billing', jsonb_build_object(
      'source', 'Subscription state last reported by Stripe webhooks',
      'activeSubscriptions', (select count(*) from public.subscriptions where status in ('active', 'trialing')),
      'pastDue', (select count(*) from public.subscriptions where status = 'past_due'),
      'cancellingAtPeriodEnd', (select count(*) from public.subscriptions where status in ('active', 'trialing') and cancel_at_period_end),
      'cancelledLast30Days', (select count(*) from public.subscriptions where canceled_at > now() - interval '30 days'),
      -- Paying subscriptions only (trials and past-due excluded); annual amounts spread over 12 months.
      'mrrCents', (select coalesce(sum(case billing_interval when 'year' then amount_cents / 12.0 else amount_cents end), 0)::bigint
         from public.subscriptions where status = 'active' and amount_cents is not null),
      'currency', 'usd',
      'compedUsers', (select count(distinct user_id) from public.plan_grants where expires_at is null or expires_at > now()),
      'freeToPaidRate', case when v_users = 0 then null else round(v_paid_ever::numeric / v_users, 4) end),
    'funnel30d', (select coalesce(jsonb_object_agg(name, n), '{}'::jsonb) from (
        select e.name, count(*) n from public.analytics_events e
        where e.occurred_at > now() - interval '30 days' group by e.name) x)
  );
end;
$$;

revoke all on function public.am_i_admin(), public.admin_metrics() from public, anon;
grant execute on function public.am_i_admin(), public.admin_metrics() to authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges: nothing in harada_private is callable by anon/PUBLIC (Supabase grants EXECUTE to PUBLIC
-- on new functions by default). `authenticated` keeps exactly what the invoker RPCs it calls need.
-- ---------------------------------------------------------------------------
revoke all on all functions in schema harada_private from public, anon;
grant execute on function harada_private.is_write_rpc(text), harada_private.parse_answers(jsonb),
  harada_private.require_feature(text, text) to authenticated;
