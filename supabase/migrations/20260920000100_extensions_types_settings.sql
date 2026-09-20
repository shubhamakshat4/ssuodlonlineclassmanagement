-- Phase 1: extensions, enum types, shared trigger functions, app settings.
-- Applies unchanged on Supabase cloud and on the embedded Postgres used by tests.

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('student', 'teacher', 'admin');
create type public.student_status as enum ('active', 'on_hold', 'withdrawn', 'graduated');
create type public.session_status as enum ('scheduled', 'cancelled', 'completed');
create type public.meeting_provider as enum ('teams', 'custom');
create type public.sync_status as enum ('pending', 'provisioning', 'provisioned', 'failed', 'cancelled');
create type public.recording_status as enum ('available', 'expired', 'failed');

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Runtime configuration that database triggers need (the DB cannot read env vars).
-- Single row, enforced by the check on id. Mirrors the App section of .env.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id                              int primary key default 1 check (id = 1),
  allowed_student_domain          text not null default 'srisriuniversity.edu.in',
  join_window_lead_minutes        int  not null default 10 check (join_window_lead_minutes between 0 and 120),
  recording_retention_days        int  not null default 30 check (recording_retention_days between 1 and 365),
  session_generation_horizon_days int  not null default 21 check (session_generation_horizon_days between 1 and 90),
  timezone                        text not null default 'Asia/Kolkata',
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

insert into public.app_settings (id) values (1);

create or replace function public.app_setting_int(p_name text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case p_name
    when 'join_window_lead_minutes' then join_window_lead_minutes
    when 'recording_retention_days' then recording_retention_days
    when 'session_generation_horizon_days' then session_generation_horizon_days
  end
  from public.app_settings where id = 1;
$$;

create or replace function public.app_setting_text(p_name text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case p_name
    when 'allowed_student_domain' then allowed_student_domain
    when 'timezone' then timezone
  end
  from public.app_settings where id = 1;
$$;
