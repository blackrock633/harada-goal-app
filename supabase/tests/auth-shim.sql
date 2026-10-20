-- TEST-ONLY emulation of the parts of a Supabase database that our migrations depend on.
-- Applied to local PGlite before supabase/migrations/*.sql. NEVER apply this to a real Supabase
-- project: there, the auth schema, roles and auth.uid() already exist and are managed by Supabase.
--
-- Fidelity notes (what is and isn't emulated):
--  * auth.uid() reads request.jwt.claims ->> 'sub', exactly like Supabase's implementation.
--  * Roles anon / authenticated / service_role exist; service_role has BYPASSRLS like Supabase.
--  * auth.users is reduced to the columns our trigger reads.
--  * GoTrue (sign-up, sessions, JWT signing) is NOT emulated; auth flows are tested with a fake gateway.

create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(current_setting('request.jwt.claim.sub', true),
             (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')),
    ''
  )::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase's default privileges grant table access to these roles; RLS then narrows it.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
