-- Forge builder schema. Run this in your Supabase SQL editor.

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text,
  description text not null,
  stack text,
  status text not null default 'DESCRIBING',
  -- DESCRIBING | STACK | PLANNING | CLARIFYING | BUILDING | COMPLETE
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists project_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  plan_json jsonb not null,
  approved_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists clarifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  questions jsonb not null default '[]',
  answers jsonb not null default '[]',
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists generated_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  file_path text not null,
  content text not null,
  language text,
  created_at timestamptz default now(),
  unique(project_id, file_path)
);

create table if not exists preview_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  sandpack_state jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_projects_status on projects(status);
create index if not exists idx_generated_files_project on generated_files(project_id);
create index if not exists idx_plans_project on project_plans(project_id);

-- Only the server (service role key) touches these tables, so keep RLS on
-- with no public policies: the service role bypasses RLS.
alter table projects enable row level security;
alter table project_plans enable row level security;
alter table clarifications enable row level security;
alter table generated_files enable row level security;
alter table preview_snapshots enable row level security;

grant all on projects, project_plans, clarifications, generated_files, preview_snapshots to service_role;
