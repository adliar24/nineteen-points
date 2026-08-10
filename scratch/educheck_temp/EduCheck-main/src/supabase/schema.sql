-- EduCheck Supabase Schema
-- Run this in Supabase SQL Editor to setup or update database.
-- This script is IDEMPOTENT - safe to run multiple times.

begin;

-- Create extension if not exists
create extension if not exists "pgcrypto";

-- ==================== TEACHER PROFILES ====================
create table if not exists public.teacher_profiles (
  id text primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  "teacherName" text not null,
  schools jsonb not null default '[]'::jsonb,
  "currentSchoolIndex" integer not null default 0,
  "schoolYear" text not null,
  subjects jsonb not null default '[]'::jsonb,
  "customSubjects" jsonb not null default '[]'::jsonb,
  "lateSetting" jsonb not null default '{"isEnabled": true, "bufferMinutes": 15}'::jsonb,
  "notificationMinutes" integer not null default 0,
  "createdAt" text not null,
  constraint teacher_profiles_notification_minutes_check check ("notificationMinutes" >= 0),
  constraint teacher_profiles_schools_is_array check (jsonb_typeof(schools) = 'array'),
  constraint teacher_profiles_subjects_is_array check (jsonb_typeof(subjects) = 'array'),
  constraint teacher_profiles_custom_subjects_is_array check (jsonb_typeof("customSubjects") = 'array'),
  constraint teacher_profiles_late_setting_is_object check (jsonb_typeof("lateSetting") = 'object')
);

-- ==================== CLASSES ====================
create table if not exists public.classes (
  id text primary key,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  subject text not null,
  "schoolIndex" integer not null default 0,
  "createdAt" text not null
);

-- ==================== STUDENTS ====================
create table if not exists public.students (
  id text primary key,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  "classId" text not null,
  name text not null,
  "createdAt" text not null,
  "face_embedding" text,
  "face_id" text,
  "face_vector" text
);

-- Enable pgvector extension
create extension if not exists vector;

-- Function to compute cosine similarity between two vectors
create or replace function cosine_similarity(vec1 text, vec2 text) returns float as $$
declare
  v1 float[];
  v2 float[];
  dot_product float := 0;
  norm1 float := 0;
  norm2 float := 0;
  result float;
begin
  v1 := string_to_array(vec1, ',')::float[];
  v2 := string_to_array(vec2, ',')::float[];
  
  for i in 1..array_length(v1, 1) loop
    dot_product := dot_product + v1[i] * v2[i];
    norm1 := norm1 + v1[i] * v1[i];
    norm2 := norm2 + v2[i] * v2[i];
  end loop;
  
  norm1 := sqrt(norm1);
  norm2 := sqrt(norm2);
  
  if norm1 = 0 or norm2 = 0 then
    return 0;
  end if;
  
  result := dot_product / (norm1 * norm2);
  return result;
end;
$$ language plpgsql;

-- RPC function to match face descriptor with all students
create or replace function match_face_descriptor(
  input_descriptor text,
  threshold float default 0.4
)
returns table (
  student_id text,
  name text,
  similarity float
)
language plpgsql
security definer
as $$
begin
  return query
  select 
    s.id as student_id,
    s.name,
    cosine_similarity(input_descriptor, s.face_vector) as similarity
  from public.students s
  where s.face_vector is not null
    and s.face_vector != ''
  order by similarity desc
  limit 1;
end;
$$;

-- RPC function to match face descriptor with specific class
create or replace function match_face_descriptor_with_class(
  input_descriptor text,
  class_id text,
  threshold float default 0.6
)
returns table (
  student_id text,
  name text,
  similarity float
)
language plpgsql
security definer
as $$
begin
  return query
  select 
    s.id as student_id,
    s.name,
    cosine_similarity(input_descriptor, s.face_vector) as similarity
  from public.students s
  where s."classId" = class_id
    and s.face_vector is not null
    and s.face_vector != ''
  order by similarity desc
  limit 1;
end;
$$;

-- ==================== SCHEDULES ====================
create table if not exists public.schedules (
  id text primary key,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  "dayName" text not null,
  "classId" text not null,
  "startTime" text not null,
  "endTime" text not null
);

-- ==================== SESSIONS ====================
create table if not exists public.sessions (
  id text primary key,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  "classId" text not null,
  "schoolYear" text not null,
  "dateISO" text not null,
  "dayName" text not null,
  "dateLabel" text not null,
  "meetingNumber" integer not null,
  topic text not null default '',
  "scheduleId" text,
  "createdAt" text not null
);

-- ==================== RECORDS ====================
create table if not exists public.records (
  id text primary key,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  "sessionId" text not null,
  "studentId" text not null,
  status text not null,
  "timeISO" text not null,
  "timeHHMMSS" text not null,
  note text,
  constraint records_status_check check (status in ('Hadir', 'Izin', 'Sakit', 'Alpha', 'Terlambat'))
);

-- ==================== EVENTS ====================
create table if not exists public.events (
  id text primary key,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  "dateISO" text not null,
  type text not null,
  description text,
  "isFullDay" boolean not null default true,
  "startTime" text,
  "endTime" text,
  "createdAt" text not null,
  constraint events_type_check check (type in ('Libur', 'Sakit', 'Dinas', 'Lainnya'))
);

-- ==================== CANCELLATIONS ====================
create table if not exists public.cancellations (
  id text primary key,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  "classId" text not null,
  "dateISO" text not null,
  "scheduleId" text,
  reason text
);

-- ==================== INDEXES ====================
create index if not exists classes_teacher_id_idx on public.classes (teacher_id);
create index if not exists students_teacher_id_idx on public.students (teacher_id);
create index if not exists students_class_id_idx on public.students ("classId");
create index if not exists schedules_teacher_id_idx on public.schedules (teacher_id);
create index if not exists schedules_class_id_idx on public.schedules ("classId");
create index if not exists sessions_teacher_id_idx on public.sessions (teacher_id);
create index if not exists sessions_class_id_idx on public.sessions ("classId");
create index if not exists records_teacher_id_idx on public.records (teacher_id);
create index if not exists records_session_id_idx on public.records ("sessionId");
create index if not exists records_student_id_idx on public.records ("studentId");
create index if not exists events_teacher_id_idx on public.events (teacher_id);
create index if not exists cancellations_teacher_id_idx on public.cancellations (teacher_id);
create index if not exists cancellations_class_id_idx on public.cancellations ("classId");

-- ==================== ROW LEVEL SECURITY ====================
-- DISABLE RLS for easier development (enable and configure policies for production)
alter table public.teacher_profiles disable row level security;
alter table public.classes disable row level security;
alter table public.students disable row level security;
alter table public.schedules disable row level security;
alter table public.sessions disable row level security;
alter table public.records disable row level security;
alter table public.events disable row level security;
alter table public.cancellations disable row level security;

-- If you want to enable RLS later, uncomment these and add proper policies:
-- alter table public.teacher_profiles enable row level security;
-- alter table public.classes enable row level security;
-- alter table public.students enable row level security;
-- alter table public.schedules enable row level security;
-- alter table public.sessions enable row level security;
-- alter table public.records enable row level security;
-- alter table public.events enable row level security;
-- alter table public.cancellations enable row level security;

commit;
