-- Dart Tracker schema (applied to the Supabase project as migrations
-- "scorecards_password_access" + follow-ups). Reference copy.
--
-- Model: each SCORECARD is an isolated tournament (its own players + scores),
-- reached only by knowing its password. No usernames, no listing. The client
-- never touches the tables directly — RLS is on with NO policies and table
-- grants are revoked from anon/authenticated, so every read/write goes through
-- the SECURITY DEFINER functions below, each scoped by a scorecard id (an
-- unguessable uuid handed out only by open_scorecard / create_scorecard).

create extension if not exists pgcrypto with schema extensions;

create table public.scorecards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pw_hash text not null,               -- bcrypt via extensions.crypt()
  created_at timestamptz not null default now()
);
alter table public.scorecards enable row level security;   -- no policies => sealed

create table public.players (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references public.scorecards(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create unique index players_card_name_idx on public.players (scorecard_id, lower(name));
create index players_card_idx on public.players (scorecard_id);
alter table public.players enable row level security;

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references public.scorecards(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  day date not null default current_date,
  throw1 integer not null default 0 check (throw1 between 0 and 180),
  throw2 integer not null default 0 check (throw2 between 0 and 180),
  throw3 integer not null default 0 check (throw3 between 0 and 180),
  total integer generated always as (throw1 + throw2 + throw3) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, day)
);
create index scores_card_idx on public.scores (scorecard_id);
create index scores_day_idx on public.scores (day);
alter table public.scores enable row level security;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger scores_set_updated_at before update on public.scores
for each row execute function public.set_updated_at();

revoke all on public.scorecards from anon, authenticated;
revoke all on public.players   from anon, authenticated;
revoke all on public.scores    from anon, authenticated;

-- ---- auth RPCs ----
-- create_scorecard(name, password) -> (id, name)   -- password must be unique & >= 4 chars
-- open_scorecard(password)         -> (id, name)   -- empty result = wrong password
-- change_scorecard_password(card, old, new) -> void

-- ---- data RPCs (all take the scorecard id as p_card) ----
-- sc_list_players(card)                              -> setof (id, name)
-- sc_add_player(card, name)                          -> void
-- sc_rename_player(card, player, name)               -> void
-- sc_week_scores(card, from, to)                     -> setof (day, total, player_id, player_name)
-- sc_get_score(card, player, day)                    -> setof (throw1, throw2, throw3)
-- sc_upsert_score(card, player, day, t1, t2, t3)     -> void
-- sc_player_days_since(card, player, since)          -> setof date
--
-- All are SECURITY DEFINER with a pinned search_path, EXECUTE granted to
-- anon + authenticated. See the migration for the full bodies.
