-- Orbit — task manager schema. ADDITIVE to the shared (Tandem/Tally) Supabase project.
-- Run in Dashboard → SQL Editor. Safe to re-run: policies are drop-and-recreate
-- (Postgres has no "create policy if not exists"), and there is no DROP TABLE /
-- DELETE / TRUNCATE anywhere, so existing rows are never touched. The editor's
-- "destructive operations" warning fires on the `drop policy` lines only.
--
-- Relies on project-level public.profiles (owned by tandem/supabase/schema.sql).
--
-- Orbit is SINGLE-USER and private: every table is owner-only, unlike the shared
-- read-all budget_* / tandem tables. The other person in this project must never
-- see a row here, which is why there is no "read all (authenticated)" policy.

-- ── v1: areas, projects, tasks ────────────────────────────────────────────────

-- Coarse life buckets. Seeded below so they never have to be created by hand.
create table if not exists public.task_areas (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  icon        text not null default '📁',
  colour      text not null default '#a78bfa',
  sort_order  integer not null default 0,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (owner_id, name)
);

-- Projects and Lists are the same table. `kind` changes presentation only:
-- a 'list' (Groceries, Wishlist) renders as a flat quick-add roll with no date
-- or priority chrome; a 'project' renders with due dates and a progress bar.
-- Keeping them together means smart capture can file into @groceries for free.
create table if not exists public.task_projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  area_id     uuid references public.task_areas (id) on delete set null,
  name        text not null check (length(trim(name)) > 0),
  kind        text not null default 'project' check (kind in ('project', 'list')),
  icon        text not null default '🗂️',
  colour      text not null default '#ffb454',
  sort_order  integer not null default 0,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (owner_id, name)
);

-- The spine. Everything with a checkbox is a row here: to-dos, subtasks, grocery
-- items, wishlist items, chores, maintenance jobs, habit occurrences and
-- important-date occurrences. Separate tables per feature would multiply every
-- screen, every realtime subscription and every digest query.
--
-- due_on + due_time are deliberately two columns, not one timestamptz: a single
-- timestamp forces a fake time onto every dated task. Two columns let "Friday"
-- and "Friday 3pm" be genuinely different states, which is how a low-confidence
-- capture can yield a whole day and never a guessed time.
--
-- There is no is_inbox flag: the Inbox is the *absence* of triage, so a flag
-- would desync the moment something is filed. See tasksInbox() in src/data.
create table if not exists public.task_tasks (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  title            text not null check (length(trim(title)) > 0),
  notes            text not null default '',
  project_id       uuid references public.task_projects (id) on delete set null,
  area_id          uuid references public.task_areas (id) on delete set null,
  parent_id        uuid references public.task_tasks (id) on delete cascade,
  kind             text not null default 'task' check (kind in ('task', 'habit', 'event')),
  status           text not null default 'open' check (status in ('open', 'done', 'dropped')),
  priority         smallint not null default 0 check (priority between 0 and 3),
  due_on           date,
  due_time         time,
  starts_on        date,
  estimate_min     integer check (estimate_min > 0),
  tags             text[] not null default '{}',
  source           text not null default 'app'
                     check (source in ('app', 'capture', 'recurrence', 'template', 'import')),
  -- The raw typed string is always kept so nothing the parser guessed is
  -- unrecoverable, and 'low' confidence is surfaced in the UI as a guess.
  capture_text     text,
  parse_confidence text check (parse_confidence in ('high', 'low')),
  completed_at     timestamptz,
  completed_on     date,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists task_tasks_due_idx       on public.task_tasks (owner_id, status, due_on);
create index if not exists task_tasks_project_idx   on public.task_tasks (owner_id, project_id);
create index if not exists task_tasks_parent_idx    on public.task_tasks (owner_id, parent_id);
create index if not exists task_tasks_completed_idx on public.task_tasks (owner_id, completed_on);
create index if not exists task_tasks_tags_idx      on public.task_tasks using gin (tags);

-- ── Seeds ─────────────────────────────────────────────────────────────────────
-- Orbit is single-user, so the seeds belong to one account. Change the email
-- below if the owner ever changes. Idempotent: re-running inserts nothing new.

do $$
declare
  seed_email constant text := 'harrisonc2105@gmail.com';
  owner uuid;
begin
  select id into owner from auth.users where lower(email) = lower(seed_email);

  if owner is null then
    raise notice 'Orbit seeds skipped: no auth user for %', seed_email;
    return;
  end if;

  -- Profile may not exist yet if this runs before tandem's backfill.
  insert into public.profiles (id, display_name)
  values (owner, split_part(seed_email, '@', 1))
  on conflict (id) do nothing;

  insert into public.task_areas (owner_id, name, icon, colour, sort_order)
  select owner, v.name, v.icon, v.colour, v.sort_order
  from (values
    ('Work',     '💼', '#7dd3fc', 10),
    ('Home',     '🏠', '#ffb454', 20),
    ('Car',      '🚗', '#f9a8d4', 30),
    ('Health',   '🩺', '#4bd08a', 40),
    ('Money',    '💰', '#fbbf24', 50),
    ('Personal', '🌱', '#a78bfa', 60),
    ('Dates',    '🎂', '#fca5a5', 70)
  ) as v(name, icon, colour, sort_order)
  on conflict (owner_id, name) do nothing;

  insert into public.task_projects (owner_id, area_id, name, kind, icon, sort_order)
  select owner, a.id, v.name, v.kind, v.icon, v.sort_order
  from (values
    ('Groceries',   'list',    '🧺', 'Home', 10),
    ('Wishlist',    'list',    '🎁', 'Personal', 20),
    ('Chores',      'project', '🧽', 'Home', 30),
    ('Maintenance', 'project', '🔧', 'Home', 40)
  ) as v(name, kind, icon, area_name, sort_order)
  join public.task_areas a on a.owner_id = owner and a.name = v.area_name
  on conflict (owner_id, name) do nothing;
end $$;

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- Owner-only across the board. Generalised over the table list rather than
-- copy-pasted per table (the tax_* pattern from tally/supabase/schema.sql).

do $$
declare t text;
begin
  foreach t in array array['task_areas', 'task_projects', 'task_tasks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: owner only" on public.%I', t, t);
    execute format(
      'create policy "%s: owner only" on public.%I for all to authenticated '
      'using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t, t);
  end loop;
end $$;

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Guarded so re-running the file doesn't error on an already-published table.

do $$
declare t text;
begin
  foreach t in array array['task_areas', 'task_projects', 'task_tasks'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
