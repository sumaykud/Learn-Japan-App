-- 001_init.sql — accounts and synced study progress
--
-- Applied to: Neon project learn-japan-app, branch main, database neondb.
-- Reached from the browser through the Neon Data API (PostgREST), so every
-- table here is exposed as a REST resource and RLS is the ONLY thing standing
-- between one learner's rows and another's. Read §4 before changing a policy.

-- ---------------------------------------------------------------------------
-- 1. Helper
-- ---------------------------------------------------------------------------

-- Bumps updated_at on every write so the sync layer can resolve conflicts by
-- comparing timestamps rather than trusting the client's clock.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- One row per signed-in learner. user_id matches neon_auth.users_sync.id,
-- which is the `sub` claim of the Stack Auth JWT.
--
-- Deliberately NOT a foreign key to neon_auth.users_sync: that table is
-- populated asynchronously by Neon's sync process, so a brand-new user can
-- legitimately write here before their row has landed. A FK would reject that
-- first write and break signup.
create table if not exists public.profiles (
  user_id      text primary key,
  display_name text,
  levels       text[] not null default array['N5'],
  furigana     text not null default 'on'    check (furigana in ('on', 'off', 'kana')),
  theme        text not null default 'light' check (theme in ('light', 'dark')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One row per (learner, flashcard). card_id is the app's derived id, e.g.
-- "v:N5:食べる" — see SPEC.md §4. Card ids are content-derived and stable, so
-- these rows survive content edits that do not change the word itself.
create table if not exists public.srs_cards (
  user_id       text not null,
  card_id       text not null,
  ease          real    not null default 2.5,
  interval_days real    not null default 0,
  reps          integer not null default 0,
  lapses        integer not null default 0,
  seen          integer not null default 0,
  due           timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, card_id)
);

-- One row per (learner, local calendar day). The day is computed on the client
-- because a streak must roll over at the learner's midnight, not UTC's.
create table if not exists public.review_log (
  user_id    text not null,
  day        date    not null,
  reviews    integer not null default 0,
  correct    integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- 3. Indexes and triggers
-- ---------------------------------------------------------------------------

-- The hot query is "what is due for me now", ordered by due time.
create index if not exists srs_cards_user_due_idx on public.srs_cards (user_id, due);

drop trigger if exists profiles_touch    on public.profiles;
drop trigger if exists srs_cards_touch   on public.srs_cards;
drop trigger if exists review_log_touch  on public.review_log;

create trigger profiles_touch   before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger srs_cards_touch  before update on public.srs_cards
  for each row execute function public.touch_updated_at();
create trigger review_log_touch before update on public.review_log
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------------
--
-- auth.user_id() returns the `sub` claim of the verified JWT as text, or NULL
-- when the request is unauthenticated.
--
-- Every policy pairs USING (which rows you may read/update/delete) with
-- WITH CHECK (what you may write). Omitting WITH CHECK would let a learner
-- insert rows owned by someone else, so both halves are mandatory.
--
-- The `anonymous` role gets no grants at all: signed-out users study entirely
-- in localStorage and never reach the database.

alter table public.profiles   enable row level security;
alter table public.srs_cards  enable row level security;
alter table public.review_log enable row level security;

-- Defence in depth: FORCE applies RLS even to the table owner, so a future
-- server-side script running as neondb_owner cannot accidentally bypass it.
alter table public.profiles   force row level security;
alter table public.srs_cards  force row level security;
alter table public.review_log force row level security;

drop policy if exists profiles_own   on public.profiles;
drop policy if exists srs_cards_own  on public.srs_cards;
drop policy if exists review_log_own on public.review_log;

create policy profiles_own on public.profiles
  for all to authenticated
  using (user_id = auth.user_id())
  with check (user_id = auth.user_id());

create policy srs_cards_own on public.srs_cards
  for all to authenticated
  using (user_id = auth.user_id())
  with check (user_id = auth.user_id());

create policy review_log_own on public.review_log
  for all to authenticated
  using (user_id = auth.user_id())
  with check (user_id = auth.user_id());

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles   to authenticated;
grant select, insert, update, delete on public.srs_cards  to authenticated;
grant select, insert, update, delete on public.review_log to authenticated;

-- Explicitly revoke from the signed-out role. add_default_grants may have
-- handed it read access when the Data API was provisioned; study data is
-- never public.
revoke all on public.profiles   from anonymous;
revoke all on public.srs_cards  from anonymous;
revoke all on public.review_log from anonymous;
