-- Minimal stand-in for the parts of a Supabase project that our migrations depend on, so the
-- same migrations + seed run on a plain Postgres 17 (embedded) for the RLS test suite.
--
-- What it recreates:
--   * roles anon / authenticated / service_role (bypassrls) / supabase_auth_admin
--   * schema `extensions` (where Supabase installs citext, pgcrypto, ...)
--   * schema `auth` with `users`, `identities`, and uid()/jwt()/role() reading request.jwt.claims
--   * Supabase's default privileges on public for the app roles
-- Nothing here is used in production.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role supabase_auth_admin nologin noinherit;

create schema if not exists extensions;
create schema if not exists auth;

grant usage on schema extensions to anon, authenticated, service_role, supabase_auth_admin;
grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;
grant usage on schema auth to supabase_auth_admin, authenticated, service_role;
grant all on schema auth to supabase_auth_admin;

-- Supabase grants app roles full table privileges and leaves RLS as the gate.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema extensions grant execute on functions to anon, authenticated, service_role;

-- (search_path = public, extensions is set per database by the harness)

create table auth.users (
  id                      uuid primary key,
  instance_id             uuid,
  aud                     varchar(255),
  role                    varchar(255),
  email                   varchar(255),
  encrypted_password      varchar(255),
  email_confirmed_at      timestamptz,
  invited_at              timestamptz,
  confirmation_token      varchar(255),
  recovery_token          varchar(255),
  email_change            varchar(255),
  email_change_token_new  varchar(255),
  raw_app_meta_data       jsonb,
  raw_user_meta_data      jsonb,
  is_super_admin          boolean,
  created_at              timestamptz,
  updated_at              timestamptz,
  phone                   text unique,
  is_sso_user             boolean not null default false,
  deleted_at              timestamptz,
  is_anonymous            boolean not null default false
);
create unique index users_email_idx on auth.users (lower(email));

create table auth.identities (
  id               uuid primary key default gen_random_uuid(),
  provider_id      text not null,
  user_id          uuid not null references auth.users (id) on delete cascade,
  identity_data    jsonb not null,
  provider         text not null,
  last_sign_in_at  timestamptz,
  created_at       timestamptz,
  updated_at       timestamptz,
  email            text generated always as (lower(identity_data->>'email')) stored,
  unique (provider_id, provider)
);

grant all on auth.users, auth.identities to supabase_auth_admin;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb;
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.role', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    ),
    ''
  )::text;
$$;

grant execute on function auth.uid(), auth.jwt(), auth.role() to anon, authenticated, service_role, supabase_auth_admin;
