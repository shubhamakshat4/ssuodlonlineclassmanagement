-- Students: real emails only, and password sign-in instead of Google.
--
-- 1. Two separate email fields. The ODL workbooks carry a personal "Email Id" for every student and an
--    "SSU Email Id" only for the cohorts that have been issued one. Both are stored as they are; neither
--    is invented. The login identity (profiles.email) is the SSU address when there is one, otherwise the
--    personal address, so no student is locked out while the university issues the rest.
-- 2. roll_number becomes nullable: the August 2026 admissions have not been given one yet.
-- 3. Accounts are created only by the ODL office. Google sign-in is gone, so the domain rule goes with it
--    and every account must carry the provisioned_by stamp that only the Admin API can set.
-- 4. Security questions, so a student can reset their own password without any email being sent
--    (Supabase's built-in mailer is rate limited and not usable for a 600-student cohort).

-- ---------------------------------------------------------------------------
-- 1 + 2. Student identity columns
-- ---------------------------------------------------------------------------
alter table public.students
  add column if not exists college_email citext,
  add column if not exists personal_email citext;

comment on column public.students.college_email is 'University address from the SSU Email Id column; NULL until one is issued';
comment on column public.students.personal_email is 'The student''s own address from the Email Id column';

create unique index if not exists students_college_email_key on public.students (college_email) where college_email is not null;
create index if not exists students_personal_email_idx on public.students (personal_email);

alter table public.students alter column roll_number drop not null;
comment on column public.students.roll_number is 'University roll number; NULL for admissions that have not been issued one';

-- ---------------------------------------------------------------------------
-- 3. Account creation: ODL office only
-- ---------------------------------------------------------------------------
create or replace function public.before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(event->'user'->'app_metadata', '{}'::jsonb);
begin
  -- app_metadata can only be set through the Admin API, so this is the "created by the ODL office" test.
  if coalesce(v_meta->>'provisioned_by', '') = '' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Accounts are created by the ODL office. Contact the ODL department if you cannot sign in.'));
  end if;
  return '{}'::jsonb;
end;
$$;

create or replace function public.auth_users_before_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
begin
  if coalesce(v_meta->>'provisioned_by', '') = '' then
    raise exception 'Accounts are created by the ODL office. Contact the ODL department if you cannot sign in.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Security questions for self-service password reset
-- ---------------------------------------------------------------------------
create table if not exists public.security_questions (
  id      smallint primary key,
  prompt  text not null,
  is_active boolean not null default true
);

insert into public.security_questions (id, prompt) values
  (1, 'What is your mother''s first name?'),
  (2, 'What is your father''s first name?'),
  (3, 'In which town or city were you born?'),
  (4, 'What was the name of your first school?'),
  (5, 'What is your favourite subject?'),
  (6, 'What is the name of your home town''s nearest railway station?')
on conflict (id) do update set prompt = excluded.prompt;

create table if not exists public.security_answers (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  question_id  smallint not null references public.security_questions (id) on delete restrict,
  answer_hash  text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- No policies: answers are never read or written by a browser. Every path that touches them runs in a
-- server action with the service role, which bypasses RLS.
alter table public.security_questions enable row level security;
alter table public.security_answers enable row level security;

drop policy if exists security_questions_select on public.security_questions;
create policy security_questions_select on public.security_questions
  for select using (is_active);

grant select on public.security_questions to authenticated, anon;

-- Answers are compared in the database so the hash never leaves it.
create or replace function public.check_security_answer(p_user uuid, p_question smallint, p_answer text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.security_answers a
     where a.user_id = p_user
       and a.question_id = p_question
       and a.answer_hash = extensions.crypt(lower(btrim(p_answer)), a.answer_hash)
  );
$$;

revoke all on function public.check_security_answer(uuid, smallint, text) from public, anon, authenticated;

create or replace function public.set_security_answer(p_user uuid, p_question smallint, p_answer text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  insert into public.security_answers (user_id, question_id, answer_hash)
  values (p_user, p_question, extensions.crypt(lower(btrim(p_answer)), extensions.gen_salt('bf')))
  on conflict (user_id, question_id)
    do update set answer_hash = excluded.answer_hash, updated_at = now();
$$;

revoke all on function public.set_security_answer(uuid, smallint, text) from public, anon, authenticated;

-- Has this user set up enough questions to reset their own password?
create or replace function public.security_answer_count(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.security_answers where user_id = p_user;
$$;

revoke all on function public.security_answer_count(uuid) from public, anon;
grant execute on function public.security_answer_count(uuid) to authenticated;

drop trigger if exists security_answers_set_updated_at on public.security_answers;
create trigger security_answers_set_updated_at
  before update on public.security_answers
  for each row execute function public.set_updated_at();
