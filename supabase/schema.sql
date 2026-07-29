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

-- ── v2: recurrence series + materialised occurrences ─────────────────────────

-- A rule lives in its own table rather than as columns on a task, because an
-- occurrence must be individually reschedulable and annotatable without
-- mutating the rule, and a habit's history is a stream of occurrences. Putting
-- the rule on the task means completing it rewrites its own due date, which
-- destroys history — exactly the flaw in the bot's maintenance_tracker.py,
-- which stores only last_done and so has no record of when anything was
-- actually serviced.
create table if not exists public.task_series (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  notes        text not null default '',
  project_id   uuid references public.task_projects (id) on delete set null,
  area_id      uuid references public.task_areas (id) on delete set null,
  kind         text not null default 'task' check (kind in ('task', 'habit', 'event')),
  priority     smallint not null default 0 check (priority between 0 and 3),
  tags         text[] not null default '{}',
  estimate_min integer check (estimate_min > 0),
  due_time     time,

  rule_type    text not null check (rule_type in
                 ('daily', 'weekly', 'monthly_day', 'monthly_last',
                  'monthly_nth', 'yearly', 'after_completion')),
  step         integer not null default 1 check (step > 0),        -- "every N"
  weekdays     smallint[] not null default '{}',                   -- 0=Sun … 6=Sat
  month_day    smallint check (month_day between 1 and 31),
  nth          smallint check (nth between -1 and 5),              -- -1 = last
  month        smallint check (month between 1 and 12),
  after_n      integer check (after_n > 0),
  after_unit   text check (after_unit in ('day', 'week', 'month')),

  anchor_on    date not null,
  until_on     date,
  -- Days before the due date this should start being surfaced: birthdays want
  -- a week, a rego renewal a fortnight.
  lead_days    integer not null default 0 check (lead_days >= 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists task_series_active_idx on public.task_series (owner_id, active);

-- Occurrence columns on the spine. Additive so v1 databases upgrade in place.
alter table public.task_tasks add column if not exists series_id uuid
  references public.task_series (id) on delete cascade;
alter table public.task_tasks add column if not exists occurrence_key text;

-- THE constraint that makes generation idempotent: it can run on every app
-- open, from any device, forever, with no coordination between them.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'task_tasks_series_occurrence_key'
  ) then
    alter table public.task_tasks
      add constraint task_tasks_series_occurrence_key unique (series_id, occurrence_key);
  end if;
end $$;

create index if not exists task_tasks_series_idx on public.task_tasks (owner_id, series_id);

-- ── v3: settings ──────────────────────────────────────────────────────────────

-- One row per owner. Lives in Postgres rather than localStorage because the
-- notification Edge Function needs to read it server-side, and because a phone
-- and a laptop should agree about how long the day is.
--
-- Capacity is a weekday array rather than its own table: a per-day capacity
-- table would be another field that never gets filled in.
create table if not exists public.task_settings (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null unique references public.profiles (id) on delete cascade,
  -- Sunday first, matching weekdayOf() in src/domain/day.ts.
  weekday_capacity smallint[] not null default '{60,180,180,180,180,180,120}',
  day_start        time not null default '08:00',
  day_end          time not null default '21:00',
  push_lead_min    integer not null default 30 check (push_lead_min >= 0),
  digest_enabled   boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ── v4: time blocks ───────────────────────────────────────────────────────────

-- A block is its own row rather than start/end columns on a task, because one
-- task can be blocked twice in a day (two sessions), a block can be non-task
-- time (gym, work hours), and the auto-planner rewrites its own suggestions
-- without touching any task. Columns on the task would forbid all three.
create table if not exists public.task_blocks (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  on_date    date not null,
  start_time time not null,
  end_time   time not null,
  task_id    uuid references public.task_tasks (id) on delete cascade,
  label      text not null default '',
  -- 'planner' rows are the auto-plan's own workings: it clears and rebuilds
  -- those and never touches anything placed by hand.
  source     text not null default 'manual' check (source in ('manual', 'planner')),
  created_at timestamptz not null default now(),
  constraint task_blocks_ends_after_start check (end_time > start_time)
);

create index if not exists task_blocks_day_idx on public.task_blocks (owner_id, on_date);

-- ── v5: templates ─────────────────────────────────────────────────────────────

create table if not exists public.task_templates (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  icon       text not null default '🧩',
  area_id    uuid references public.task_areas (id) on delete set null,
  creates    text not null default 'tasks' check (creates in ('project', 'tasks')),
  use_count  integer not null default 0,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

-- A child table rather than a jsonb blob: templates get edited item by item, and
-- a blob means read-modify-write races and no per-row realtime. The columns are
-- deliberately task-shaped so instantiation is a straight map.
create table if not exists public.task_template_items (
  id           uuid primary key default gen_random_uuid(),
  -- owner_id is denormalised onto every table so the RLS loop stays uniform.
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  template_id  uuid not null references public.task_templates (id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  notes        text not null default '',
  sort_order   integer not null default 0,
  -- Index of the parent within the template, resolved to a real parent_id at
  -- instantiation time. Real ids don't exist until the rows are inserted.
  parent_index smallint,
  -- Days relative to the anchor date: -1 is "the night before".
  offset_days  integer,
  priority     smallint not null default 0 check (priority between 0 and 3),
  estimate_min integer check (estimate_min > 0),
  tags         text[] not null default '{}'
);

create index if not exists task_template_items_template_idx
  on public.task_template_items (owner_id, template_id, sort_order);

-- ── v6: web push ──────────────────────────────────────────────────────────────

-- One row per browser/device that has granted permission. The endpoint is the
-- push service's own URL for that device and is naturally unique.
create table if not exists public.task_push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  failure_count integer not null default 0,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

-- Send-once bookkeeping: the Postgres replacement for the bot's
-- fired_maintenance_alerts.json / fired_date_alerts.json dedupe files. Without
-- it, a quarter-hourly cron re-notifies about the same task forever.
create table if not exists public.task_notifications (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null references public.profiles (id) on delete cascade,
  task_id   uuid not null references public.task_tasks (id) on delete cascade,
  kind      text not null check (kind in ('due_soon', 'due_today', 'overdue', 'block_start')),
  sent_for  date not null,
  sent_at   timestamptz not null default now(),
  unique (owner_id, task_id, kind, sent_for)
);

-- ── v7: the Discord bot's contract ────────────────────────────────────────────

-- The household bot reads THIS VIEW, never the tables. That's the shared-data-
-- store contract: task_tasks can be refactored freely as long as the view keeps
-- its shape.
--
-- security_invoker = on so the app still sees only its owner's rows; the bot
-- uses a service-role key, which bypasses RLS by design, and only ever selects.
create or replace view public.task_digest_v
with (security_invoker = on) as
select
  t.id,
  t.title,
  t.kind,
  t.status,
  t.priority,
  t.due_on,
  t.due_time,
  t.completed_on,
  coalesce(s.lead_days, 0) as lead_days,
  p.name                   as project_name,
  a.name                   as area_name
from public.task_tasks t
left join public.task_series   s on s.id = t.series_id
left join public.task_projects p on p.id = t.project_id
left join public.task_areas    a on a.id = coalesce(t.area_id, p.area_id);

-- ── v8: appearance ────────────────────────────────────────────────────────────

-- Three text columns on the settings row rather than a table of their own:
-- there is exactly one of each per owner, and they change about as often as
-- the day length does.
--
-- Checked in the database as well as in TypeScript because a value that isn't
-- one of these is a value the stylesheet has no block for — better to reject
-- it at the write than to render an unstyled app.
--
-- Defaults match DEFAULT_APPEARANCE in src/domain/appearance.ts, so an account
-- that never opens the Appearance screen gets today's Orbit.
alter table public.task_settings
  add column if not exists ui_theme   text not null default 'halo'
    check (ui_theme in ('halo', 'telemetry', 'terrain', 'transit')),
  add column if not exists ui_palette text not null default 'indigo'
    check (ui_palette in ('indigo', 'lagoon', 'ember', 'orchid', 'phosphor')),
  add column if not exists ui_mode    text not null default 'system'
    check (ui_mode in ('system', 'light', 'dark'));

-- ── v9: all-day blocks, and a notification for important dates ────────────────

-- A block with a label and no task is an ordinary calendar entry, which is what
-- makes the calendar usable as a calendar. All-day entries are the one shape
-- the start/end pair couldn't express. Times are still written (00:00–23:59) so
-- the existing end-after-start constraint needs no exception and the grid has
-- something to lay out if the flag is turned off again.
alter table public.task_blocks
  add column if not exists all_day boolean not null default false;

-- Events were the one thing that never notified — deliberately, since a
-- birthday is not a job. But the useful moment for a birthday is a week BEFORE
-- it, while there is still time to buy something, so it gets its own kind
-- rather than borrowing due_today's. Recreated rather than added to because
-- Postgres has no "alter constraint".
alter table public.task_notifications
  drop constraint if exists task_notifications_kind_check;
alter table public.task_notifications
  add constraint task_notifications_kind_check
  check (kind in ('due_soon', 'due_today', 'overdue', 'block_start', 'event_lead'));

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

  -- Defaults good enough that Settings never has to be opened.
  insert into public.task_settings (owner_id) values (owner)
  on conflict (owner_id) do nothing;
end $$;

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- Owner-only across the board. Generalised over the table list rather than
-- copy-pasted per table (the tax_* pattern from tally/supabase/schema.sql).

do $$
declare t text;
begin
  foreach t in array array['task_areas', 'task_projects', 'task_tasks', 'task_series', 'task_settings', 'task_blocks',
                           'task_templates', 'task_template_items',
                           'task_push_subscriptions', 'task_notifications'] loop
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
  foreach t in array array['task_areas', 'task_projects', 'task_tasks', 'task_series', 'task_settings', 'task_blocks',
                           'task_templates', 'task_template_items',
                           'task_push_subscriptions', 'task_notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
