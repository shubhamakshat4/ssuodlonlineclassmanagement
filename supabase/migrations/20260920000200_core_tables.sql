-- Phase 1: core tables (SPEC.md §4). All in public, all with created_at/updated_at, RLS enabled
-- here and policies added in 20260920000400_rls.sql.

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null,
  full_name   text not null check (length(trim(full_name)) > 0),
  email       citext not null unique,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- Academic structure
-- ---------------------------------------------------------------------------
create table public.programs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique check (code ~ '^[A-Z0-9_-]{2,20}$'),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.batches (
  id                uuid primary key default gen_random_uuid(),
  program_id        uuid not null references public.programs (id) on delete restrict,
  name              text not null,
  code              text not null unique check (code ~ '^[A-Z0-9_-]{2,30}$'),
  intake_year       int not null check (intake_year between 2000 and 2100),
  current_semester  int not null default 1 check (current_semester between 1 and 12),
  start_date        date,
  end_date          date,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index batches_program_idx on public.batches (program_id);

create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs (id) on delete restrict,
  code        text not null check (code ~ '^[A-Z0-9_-]{2,20}$'),
  name        text not null,
  credits     int check (credits is null or credits between 0 and 20),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (program_id, code)
);

-- A subject offered to a batch in a given semester.
create table public.batch_subjects (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.batches (id) on delete cascade,
  subject_id  uuid not null references public.subjects (id) on delete restrict,
  semester    int not null check (semester between 1 and 12),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (batch_id, subject_id, semester)
);
create index batch_subjects_batch_idx on public.batch_subjects (batch_id);
create index batch_subjects_subject_idx on public.batch_subjects (subject_id);

create table public.students (
  id            uuid primary key references public.profiles (id) on delete cascade,
  roll_number   text not null unique,
  batch_id      uuid not null references public.batches (id) on delete restrict,
  status        public.student_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index students_batch_idx on public.students (batch_id);

create table public.teachers (
  id              uuid primary key references public.profiles (id) on delete cascade,
  employee_code   text not null unique,
  entra_upn       citext not null,
  entra_user_id   uuid,
  department      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Who teaches what, for which batch.
create table public.subject_teachers (
  id                uuid primary key default gen_random_uuid(),
  batch_subject_id  uuid not null references public.batch_subjects (id) on delete cascade,
  teacher_id        uuid not null references public.teachers (id) on delete cascade,
  is_primary        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (batch_subject_id, teacher_id)
);
create index subject_teachers_teacher_idx on public.subject_teachers (teacher_id);

-- ---------------------------------------------------------------------------
-- Timetable
-- ---------------------------------------------------------------------------
create table public.timetable_slots (
  id                uuid primary key default gen_random_uuid(),
  batch_subject_id  uuid not null references public.batch_subjects (id) on delete cascade,
  teacher_id        uuid not null references public.teachers (id) on delete restrict,
  day_of_week       smallint not null check (day_of_week between 0 and 6), -- 0=Sun .. 6=Sat
  start_time        time not null,
  end_time          time not null,
  effective_from    date not null,
  effective_to      date,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (end_time > start_time),
  check (effective_to is null or effective_to >= effective_from)
);
create index timetable_slots_bs_idx on public.timetable_slots (batch_subject_id);
create index timetable_slots_teacher_idx on public.timetable_slots (teacher_id);

create table public.holidays (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  name        text not null,
  batch_id    uuid references public.batches (id) on delete cascade, -- NULL = all batches
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index holidays_global_unique on public.holidays (date) where batch_id is null;
create unique index holidays_batch_unique on public.holidays (date, batch_id) where batch_id is not null;

-- ---------------------------------------------------------------------------
-- Sessions, attendance, recordings
-- ---------------------------------------------------------------------------
create table public.class_sessions (
  id                        uuid primary key default gen_random_uuid(),
  batch_subject_id          uuid not null references public.batch_subjects (id) on delete restrict,
  teacher_id                uuid not null references public.teachers (id) on delete restrict,
  timetable_slot_id         uuid references public.timetable_slots (id) on delete set null, -- NULL = ad-hoc
  scheduled_start           timestamptz not null,
  scheduled_end             timestamptz not null,
  status                    public.session_status not null default 'scheduled',
  topic                     text,

  provider                  public.meeting_provider not null default 'teams',
  graph_event_id            text,
  graph_online_meeting_id   text,
  teams_join_url            text,      -- generated, never edited by a teacher
  join_url_override         text,      -- teacher-supplied URL, wins when present
  override_set_by           uuid references public.profiles (id) on delete set null,
  override_set_at           timestamptz,

  sync_status               public.sync_status not null default 'pending',
  sync_attempts             int not null default 0,
  sync_error                text,
  sync_claimed_at           timestamptz,   -- when a provisioner claimed the row (stuck-job recovery)

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (scheduled_end > scheduled_start),
  unique (timetable_slot_id, scheduled_start)   -- idempotent generation
);
create index class_sessions_bs_start_idx on public.class_sessions (batch_subject_id, scheduled_start);
create index class_sessions_teacher_start_idx on public.class_sessions (teacher_id, scheduled_start);
create index class_sessions_sync_idx on public.class_sessions (sync_status) where sync_status in ('pending', 'provisioning', 'failed');
create index class_sessions_start_idx on public.class_sessions (scheduled_start);

create table public.attendance (
  id                uuid primary key default gen_random_uuid(),
  class_session_id  uuid not null references public.class_sessions (id) on delete cascade,
  student_id        uuid not null references public.students (id) on delete cascade,
  clicked_at        timestamptz not null default now(),
  ip                inet,
  user_agent        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (class_session_id, student_id)
);
create index attendance_student_idx on public.attendance (student_id);

create table public.recordings (
  id                  uuid primary key default gen_random_uuid(),
  class_session_id    uuid not null references public.class_sessions (id) on delete cascade,
  graph_recording_id  text,
  drive_id            text,
  drive_item_id       text,
  recorded_at         timestamptz,
  duration_seconds    int,
  size_bytes          bigint,
  expires_at          timestamptz not null,   -- recorded_at + retention (30 days)
  status              public.recording_status not null default 'available',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (class_session_id, graph_recording_id)
);
create index recordings_session_idx on public.recordings (class_session_id);
create index recordings_expires_idx on public.recordings (expires_at) where status = 'available';

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_action_idx on public.audit_log (action);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','programs','batches','subjects','batch_subjects','students','teachers',
    'subject_teachers','timetable_slots','holidays','class_sessions','attendance','recordings'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS on. Policies live in the rls migration; until then nothing is readable by app roles.
-- ---------------------------------------------------------------------------
alter table public.app_settings     enable row level security;
alter table public.profiles         enable row level security;
alter table public.programs         enable row level security;
alter table public.batches          enable row level security;
alter table public.subjects         enable row level security;
alter table public.batch_subjects   enable row level security;
alter table public.students         enable row level security;
alter table public.teachers         enable row level security;
alter table public.subject_teachers enable row level security;
alter table public.timetable_slots  enable row level security;
alter table public.holidays         enable row level security;
alter table public.class_sessions   enable row level security;
alter table public.attendance       enable row level security;
alter table public.recordings       enable row level security;
alter table public.audit_log        enable row level security;
