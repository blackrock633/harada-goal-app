-- Pro reviews, the template catalogue and progress history (docs/PREMIUM_SYSTEM.md).
--
-- Reviews: `reflections` gains a 'monthly' kind and `answers`, the extra questions of the advanced weekly and
-- monthly reviews. The three original answers stay the Free reflection. Writing a monthly review or any
-- advanced answer needs 'advanced_reviews' (a trigger, so the web server path is covered too); reading and
-- editing the original answers of an existing review never does, so a downgrade hides nothing.
--
-- Templates: one table for every template, free and premium. Content is served only through
-- get_template(), which checks 'premium_templates', so premium content never reaches a Free client.
--
-- History: goal_history() aggregates the caller's own goal by week (Pro: 'progress_history').

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
alter table public.reflections drop constraint reflections_kind_check;
alter table public.reflections add constraint reflections_kind_check check (kind in ('daily', 'weekly', 'monthly'));
alter table public.reflections add column answers jsonb not null default '{}'::jsonb;
alter table public.reflections add constraint reflections_answers_check check (
  jsonb_typeof(answers) = 'object'
  and not (answers - array['intended', 'completed', 'learned', 'priorities', 'strategy', 'obstacles'] <> '{}'::jsonb)
  and char_length(answers::text) <= 30000
);

/** The extra answers of an advanced review, validated: known keys only, text, trimmed, each <= 4000. */
create function harada_private.parse_answers(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v text;
  out jsonb := '{}'::jsonb;
begin
  if p is null or jsonb_typeof(p) = 'null' then return '{}'::jsonb; end if;
  if jsonb_typeof(p) <> 'object' then perform harada_private.fail('VALIDATION', 'Invalid answers', 'answers'); end if;
  for k in select jsonb_object_keys(p) loop
    if k <> all (array['intended', 'completed', 'learned', 'priorities', 'strategy', 'obstacles']) then
      perform harada_private.fail('VALIDATION', 'Unknown question', 'answers');
    end if;
    v := harada_private.txt(p, k, 4000);
    if v is not null and v <> '' then out := out || jsonb_build_object(k, v); end if;
  end loop;
  return out;
end;
$$;

create or replace function harada_private.check_reflection_fields(r public.reflections)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if r.went_well = '' and r.didnt_go_well = '' and r.next_change = '' and coalesce(r.answers, '{}'::jsonb) = '{}'::jsonb then
    perform harada_private.fail('VALIDATION', 'At least one reflection field must be non-empty');
  end if;
end;
$$;

create or replace function harada_private.add_reflection_impl(p_input jsonb)
returns public.reflections
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  g public.goals := harada_private.lock_goal(harada_private.req_uuid(p_input, 'goalId'), false);
  v_id uuid := harada_private.opt_uuid(p_input, 'id');
  v_date date := harada_private.opt_date(p_input, 'date');
  r public.reflections;
begin
  if v_id is not null then
    select * into r from public.reflections where id = v_id;
    if found then
      if r.goal_id <> g.id then perform harada_private.fail('CONFLICT', 'This was changed elsewhere — reload'); end if;
      return r;
    end if;
  end if;
  if v_date is null then perform harada_private.fail('VALIDATION', 'Required', 'date'); end if;
  if v_date > harada_private.user_today() then
    perform harada_private.fail('VALIDATION', 'Reflection date cannot be in the future', 'date');
  end if;
  if (p_input ->> 'kind') is null or (p_input ->> 'kind') not in ('daily', 'weekly', 'monthly') then
    perform harada_private.fail('VALIDATION', 'Choose daily, weekly or monthly', 'kind');
  end if;
  r.id := coalesce(v_id, gen_random_uuid());
  r.goal_id := g.id;
  r.date := v_date;
  r.kind := p_input ->> 'kind';
  r.went_well := coalesce(harada_private.txt(p_input, 'wentWell', 4000), '');
  r.didnt_go_well := coalesce(harada_private.txt(p_input, 'didntGoWell', 4000), '');
  r.next_change := coalesce(harada_private.txt(p_input, 'nextChange', 4000), '');
  r.answers := harada_private.parse_answers(p_input -> 'answers');
  perform harada_private.check_reflection_fields(r);
  insert into public.reflections (id, goal_id, date, kind, went_well, didnt_go_well, next_change, answers, created_at, updated_at)
  values (r.id, r.goal_id, r.date, r.kind, r.went_well, r.didnt_go_well, r.next_change, r.answers,
          harada_private.now_ms(), harada_private.now_ms())
  returning * into r;
  return r;
end;
$$;

create or replace function harada_private.update_reflection_impl(p_input jsonb)
returns public.reflections
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := harada_private.begin_write(p_input);
  r public.reflections; n public.reflections;
  v_date date;
begin
  select * into r from public.reflections where id = harada_private.req_uuid(p_input, 'reflectionId') for update;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  perform harada_private.assert_fresh(r.updated_at, p_input);
  n := r;
  if harada_private.has(p_input, 'date') then
    v_date := harada_private.opt_date(p_input, 'date');
    if v_date > harada_private.user_today() then
      perform harada_private.fail('VALIDATION', 'Reflection date cannot be in the future', 'date');
    end if;
    n.date := v_date;
  end if;
  if harada_private.has(p_input, 'kind') then
    if (p_input ->> 'kind') not in ('daily', 'weekly', 'monthly') then
      perform harada_private.fail('VALIDATION', 'Choose daily, weekly or monthly', 'kind');
    end if;
    n.kind := p_input ->> 'kind';
  end if;
  if p_input ? 'wentWell' then n.went_well := coalesce(harada_private.txt(p_input, 'wentWell', 4000), ''); end if;
  if p_input ? 'didntGoWell' then n.didnt_go_well := coalesce(harada_private.txt(p_input, 'didntGoWell', 4000), ''); end if;
  if p_input ? 'nextChange' then n.next_change := coalesce(harada_private.txt(p_input, 'nextChange', 4000), ''); end if;
  if p_input ? 'answers' then n.answers := harada_private.parse_answers(p_input -> 'answers'); end if;
  perform harada_private.check_reflection_fields(n);
  if (n.date, n.kind, n.went_well, n.didnt_go_well, n.next_change, n.answers)
     is not distinct from (r.date, r.kind, r.went_well, r.didnt_go_well, r.next_change, r.answers) then
    return r;
  end if;
  update public.reflections set date = n.date, kind = n.kind, went_well = n.went_well,
    didnt_go_well = n.didnt_go_well, next_change = n.next_change, answers = n.answers,
    updated_at = harada_private.now_ms()
  where id = r.id returning * into n;
  return n;
end;
$$;

/** Monthly reviews and advanced answers are Pro; keeping or editing what already exists never is. */
create function harada_private.enforce_review_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if (new.kind = 'monthly' and (tg_op = 'INSERT' or old.kind <> 'monthly'))
     or (new.answers <> '{}'::jsonb and (tg_op = 'INSERT' or new.answers is distinct from old.answers)) then
    select owner_id into v_owner from public.goals where id = new.goal_id;
    if not harada_private.has_feature(v_owner, 'advanced_reviews') then
      perform harada_private.fail('UPGRADE_REQUIRED',
        'Monthly reviews and the full weekly review are part of Harada Pro.', 'advanced_reviews');
    end if;
  end if;
  return new;
end;
$$;

create trigger reflections_review_entitlement before insert or update on public.reflections
  for each row execute function harada_private.enforce_review_entitlement();

revoke all on function harada_private.enforce_review_entitlement() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
create table public.goal_templates (
  id text primary key,
  tier text not null,
  name text not null,
  summary text not null,
  /** Template shape of src/domain/templates.ts without id/name/summary: goalTitle, vision, purpose, outcomes. */
  content jsonb not null,
  sort_order smallint not null default 0,
  active boolean not null default true,
  constraint goal_templates_tier_check check (tier in ('free', 'premium')),
  constraint goal_templates_id_check check (id ~ '^[a-z0-9-]{1,64}$'),
  constraint goal_templates_content_check check (
    jsonb_typeof(content) = 'object' and jsonb_typeof(content -> 'outcomes') = 'array'
    and jsonb_array_length(content -> 'outcomes') between 1 and 8)
);

alter table public.goal_templates enable row level security;
revoke all on public.goal_templates from public, anon, authenticated;
-- Served only through the functions below.

/** The catalogue: every active template's summary, and whether the caller may open it. */
create function public.list_templates()
returns table (id text, tier text, name text, summary text, outcome_count integer, action_count integer, locked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.tier, t.name, t.summary,
    jsonb_array_length(t.content -> 'outcomes'),
    (select coalesce(sum(jsonb_array_length(o -> 'actions')), 0)::integer from jsonb_array_elements(t.content -> 'outcomes') o),
    t.tier = 'premium' and not harada_private.has_feature(auth.uid(), 'premium_templates')
  from public.goal_templates t
  where t.active and auth.uid() is not null
  order by t.sort_order, t.name
$$;

/** One template's full content; premium content only for 'premium_templates'. */
create function public.get_template(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.goal_templates;
begin
  if auth.uid() is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  select * into t from public.goal_templates where id = p_id and active;
  if not found then perform harada_private.fail('NOT_FOUND', 'Not found'); end if;
  if t.tier = 'premium' then
    perform harada_private.require_feature('premium_templates', 'This template is part of Harada Pro.');
  end if;
  return t.content || jsonb_build_object('id', t.id, 'name', t.name, 'summary', t.summary, 'tier', t.tier);
end;
$$;

revoke all on function public.list_templates(), public.get_template(text) from public, anon;
grant execute on function public.list_templates(), public.get_template(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Progress history (Pro)
-- ---------------------------------------------------------------------------
/**
 * Week-by-week execution of one of the caller's goals, oldest first, for the last `p_weeks` weeks (1..52)
 * ending with the caller's current week (weeks start Monday, in the caller's time zone).
 *   tasks_due / tasks_due_done: tasks whose due date falls in the week, and how many of them are done (planned
 *     vs completed). tasks_completed: tasks completed during the week, due or not. routine_checks: routine days
 *     checked. reflections: reviews written. plan_changes: structural edits logged that week.
 * Activity only: none of these measure whether the goal itself is being achieved.
 */
create function public.goal_history(p_goal_id uuid, p_weeks integer default 12)
returns table (
  week_start date, tasks_due integer, tasks_due_done integer, tasks_completed integer,
  routine_checks integer, reflections integer, plan_changes integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tz text;
  v_today date;
  v_first date;
begin
  if v_uid is null then perform harada_private.fail('UNAUTHENTICATED', 'Please sign in'); end if;
  if not exists (select 1 from public.goals g where g.id = p_goal_id and g.owner_id = v_uid) then
    perform harada_private.fail('NOT_FOUND', 'Not found');
  end if;
  perform harada_private.require_feature('progress_history', 'Progress history is part of Harada Pro.');
  if p_weeks is null or p_weeks < 1 or p_weeks > 52 then perform harada_private.fail('VALIDATION', 'Choose 1 to 52 weeks', 'weeks'); end if;
  select coalesce(p.time_zone, 'UTC') into v_tz from public.profiles p where p.id = v_uid;
  v_today := (now() at time zone v_tz)::date;
  v_first := date_trunc('week', v_today)::date - (p_weeks - 1) * 7;
  return query
  with weeks as (
    select (v_first + i * 7) as ws from generate_series(0, p_weeks - 1) i
  )
  select w.ws,
    (select count(*)::integer from public.actions a
      where a.goal_id = p_goal_id and a.kind = 'task' and a.archived_at is null
        and a.due_date >= w.ws and a.due_date < w.ws + 7),
    (select count(*)::integer from public.actions a
      where a.goal_id = p_goal_id and a.kind = 'task' and a.archived_at is null and a.completed_at is not null
        and a.due_date >= w.ws and a.due_date < w.ws + 7),
    (select count(*)::integer from public.actions a
      where a.goal_id = p_goal_id and a.kind = 'task' and a.completed_at is not null
        and (a.completed_at at time zone v_tz)::date >= w.ws and (a.completed_at at time zone v_tz)::date < w.ws + 7),
    (select count(*)::integer from public.routine_checks c join public.actions a on a.id = c.action_id
      where a.goal_id = p_goal_id and c.date >= w.ws and c.date < w.ws + 7),
    (select count(*)::integer from public.reflections r
      where r.goal_id = p_goal_id and r.date >= w.ws and r.date < w.ws + 7),
    (select count(*)::integer from public.goal_events e
      where e.goal_id = p_goal_id and e.type not in ('action_completed', 'action_reopened', 'measure_updated')
        and (e.occurred_at at time zone v_tz)::date >= w.ws and (e.occurred_at at time zone v_tz)::date < w.ws + 7)
  from weeks w
  order by w.ws;
end;
$$;

revoke all on function public.goal_history(uuid, integer) from public, anon;
grant execute on function public.goal_history(uuid, integer) to authenticated;

create index actions_goal_completed_idx on public.actions (goal_id, completed_at) where completed_at is not null;

revoke all on function harada_private.parse_answers(jsonb) from public, anon;
grant execute on function harada_private.parse_answers(jsonb) to authenticated;

-- Free templates: the same plans the apps ship in src/domain/templates.ts (kept in sync by templates-sync test).
insert into public.goal_templates (id, tier, name, summary, content, sort_order) values
  ('marathon', 'free', 'Run a marathon', 'A proven plan to go from zero to marathon finisher over 16 weeks.', $json${"goalTitle":"Finish the City Marathon","vision":"Crossing the finish line feeling exhausted but triumphant, knowing I pushed my limits and achieved something incredible.","purpose":{"selfTangible":"Finish the race without walking","selfIntangible":"Build mental resilience and discipline","othersTangible":"Raise $1000 for charity","othersIntangible":"Inspire my family to live a healthier lifestyle"},"outcomes":[{"title":"Endurance Base","description":"Build aerobic capacity to comfortably run long distances.","measure":{"target":32,"current":0,"unit":"km long run"},"actions":[{"title":"Weekly long run","kind":"routine","schedule":{"type":"weekly","timesPerWeek":1}},{"title":"Zone 2 easy runs","kind":"routine","schedule":{"type":"weekly","timesPerWeek":2}},{"title":"Buy proper running shoes","kind":"task"}]},{"title":"Nutrition & Recovery","description":"Fuel the body properly and avoid injury.","actions":[{"title":"Post-run stretching (15m)","kind":"routine","schedule":{"type":"daily"}},{"title":"Drink 3L water","kind":"routine","schedule":{"type":"daily"}},{"title":"Research race-day fueling strategy","kind":"task"}]}]}$json$::jsonb, 0),
  ('product-launch', 'free', 'Launch a product', 'Ship your side project and get your first 100 paying users.', $json${"goalTitle":"Launch v1 and acquire 100 customers","vision":"Seeing notifications of new customers signing up while I sleep, knowing I built something people value.","purpose":{"selfTangible":"$1k MRR","selfIntangible":"Confidence in my entrepreneurial ability","othersTangible":"Provide a tool that saves people time","othersIntangible":"Contribute to the indie maker community"},"outcomes":[{"title":"MVP Development","description":"Build only the essential features needed to solve the core problem.","measure":{"target":100,"current":0,"unit":"% complete"},"actions":[{"title":"Write code","kind":"routine","schedule":{"type":"weekdays","days":[1,2,3,4,5]}},{"title":"Finalise database schema","kind":"task"},{"title":"Set up Stripe billing","kind":"task"}]},{"title":"Marketing & Distribution","description":"Get the product in front of the right audience.","actions":[{"title":"Post update on X/Twitter","kind":"routine","schedule":{"type":"daily"}},{"title":"Reach out to 5 potential users","kind":"routine","schedule":{"type":"weekly","timesPerWeek":5}},{"title":"Publish Product Hunt launch page","kind":"task"}]}]}$json$::jsonb, 1),
  ('varsity-soccer', 'free', 'Make the varsity soccer roster', 'Develop the technical skills and fitness required to impress coaches at tryouts.', $json${"goalTitle":"Make the Varsity Soccer Team","vision":"Hearing my name called when the final roster is announced and stepping onto the field in the varsity kit.","purpose":{"selfTangible":"Earn a starting position","selfIntangible":"Develop strong leadership skills","othersTangible":"Help the team reach the playoffs","othersIntangible":"Be a role model for younger players"},"outcomes":[{"title":"Technical Mastery","description":"Improve first touch and passing accuracy under pressure.","actions":[{"title":"Wall passing drills (20m)","kind":"routine","schedule":{"type":"weekly","timesPerWeek":4}},{"title":"Juggling sequence practice","kind":"routine","schedule":{"type":"daily"}}]},{"title":"Physical Fitness","description":"Achieve the stamina to play a full 90 minutes effectively.","measure":{"target":12,"current":0,"unit":"beep test level"},"actions":[{"title":"Interval sprint training","kind":"routine","schedule":{"type":"weekly","timesPerWeek":2}},{"title":"Core strength workout","kind":"routine","schedule":{"type":"weekly","timesPerWeek":3}}]}]}$json$::jsonb, 2),
  ('4-0-gpa', 'free', 'Earn a 4.0 GPA', 'Master study habits and time management to excel academically this semester.', $json${"goalTitle":"Achieve a 4.0 GPA this semester","vision":"Opening my final transcript and seeing straight As, feeling proud of my dedication.","purpose":{"selfTangible":"Qualify for academic scholarships","selfIntangible":"Build a lifelong love of learning","othersTangible":"Make my family proud","othersIntangible":"Help classmates understand difficult concepts"},"outcomes":[{"title":"Consistent Study Habits","description":"Stay ahead of assignments and avoid cramming.","actions":[{"title":"Review notes after class","kind":"routine","schedule":{"type":"weekdays","days":[1,2,3,4,5]}},{"title":"Deep work study session (2h)","kind":"routine","schedule":{"type":"weekly","timesPerWeek":5}},{"title":"Plan weekly schedule on Sunday","kind":"routine","schedule":{"type":"weekly","timesPerWeek":1}}]},{"title":"Active Participation","description":"Engage with professors and peers to deepen understanding.","actions":[{"title":"Attend office hours","kind":"routine","schedule":{"type":"weekly","timesPerWeek":1}},{"title":"Ask at least one question per class","kind":"routine","schedule":{"type":"weekdays","days":[1,2,3,4,5]}}]}]}$json$::jsonb, 3);
