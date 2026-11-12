-- eld memoir schema v1
-- Principles kept from docs/schema-v1.sql:
--   messages are append-only; every sentence cites at least one message;
--   each pipeline step is stored on its own; user-edited sentences stay locked.
-- Fixes are listed in docs/schema-fixes.md.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

create table public.chapters (
  id          text primary key,
  title       jsonb not null,
  optional    boolean not null default false,
  sort_order  int not null,
  created_at  timestamptz not null default now(),
  check (jsonb_typeof(title) = 'object')
);

create table public.users (
  id                uuid primary key default gen_random_uuid(),
  display_name      text not null,
  ui_locale         text not null default 'en' check (ui_locale in ('en', 'zh')),
  narration_locale  text not null default 'en',
  book_title        text,
  created_at        timestamptz not null default now()
);

create table public.topics (
  id                    text primary key,
  chapter_id            text not null references public.chapters (id),
  config_version        text not null,
  title                 jsonb not null,
  opening_question      text not null,
  follow_ups            jsonb not null default '[]'::jsonb,
  sensitive             boolean not null default false,
  recommend_by_default  boolean not null default true,
  recommend_rank        int,
  check (jsonb_typeof(title) = 'object'),
  check (jsonb_typeof(follow_ups) = 'array')
);

create type public.topic_status as enum ('recommendable', 'told', 'not_now', 'do_not_write');

create table public.topic_states (
  user_id     uuid not null references public.users (id),
  topic_id    text not null references public.topics (id),
  status      public.topic_status not null default 'recommendable',
  updated_at  timestamptz not null default now(),
  primary key (user_id, topic_id)
);
create index topic_states_topic_id_idx on public.topic_states (topic_id);
create index topic_states_user_status_idx on public.topic_states (user_id, status);

create type public.entry_mode as enum ('topic', 'continue', 'tell_more', 'free');

create table public.sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (id),
  topic_id          text references public.topics (id),
  story_id          uuid,
  entry_mode        public.entry_mode not null,
  followups_used    int not null default 0 check (followups_used >= 0),
  extended_by_user  boolean not null default false,
  awaiting          text check (awaiting is null or awaiting in ('cap_opt_in', 'do_not_write_confirm')),
  status            text not null default 'open' check (status in ('open', 'ended', 'abandoned')),
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  last_activity_at  timestamptz not null default now()
);
create index sessions_user_open_idx on public.sessions (user_id, last_activity_at desc) where status = 'open';
create index sessions_topic_id_idx on public.sessions (topic_id);
create index sessions_story_id_idx on public.sessions (story_id);
create index sessions_user_id_idx on public.sessions (user_id);

create type public.message_kind as enum (
  'user_turn',
  'opening',
  'follow_up',
  'extended_follow_up',
  'cap_prompt',
  'refusal_redirect',
  'distress_ack',
  'stop_ack',
  'do_not_write_prompt',
  'gap_question',
  'free_opener',
  'continue_recap',
  'reassure_switch'
);

create table public.messages (
  id           uuid primary key,
  session_id   uuid not null references public.sessions (id),
  user_id      uuid not null references public.users (id),
  role         text not null check (role in ('user', 'assistant')),
  kind         public.message_kind not null,
  content      text not null,
  locale       text not null default 'en',
  audio_url    text,
  audio_span   int4range,
  gap_id       uuid,
  in_reply_to  uuid references public.messages (id),
  created_at   timestamptz not null default now(),
  check (
    (role = 'user' and kind = 'user_turn')
    or (role = 'assistant' and kind <> 'user_turn')
  )
);
create index messages_session_created_idx on public.messages (session_id, created_at);
create index messages_user_created_idx on public.messages (user_id, created_at);
create index messages_gap_id_idx on public.messages (gap_id);
create unique index messages_one_assistant_reply_idx
  on public.messages (in_reply_to)
  where role = 'assistant' and in_reply_to is not null;

create function private.forbid_message_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'messages are append-only';
end;
$$;

create trigger messages_append_only
  before update or delete on public.messages
  for each row execute function private.forbid_message_mutation();

revoke all on function private.forbid_message_mutation() from public;

create table public.turn_classifications (
  message_id         uuid primary key references public.messages (id),
  refusal            boolean not null,
  refusal_scope      text not null check (refusal_scope in ('none', 'point', 'topic')),
  refused_point      text,
  off_topic_chapter  text references public.chapters (id),
  wants_to_stop      boolean not null,
  distress           text not null check (distress in ('none', 'mild', 'strong')),
  answer_length      text not null check (answer_length in ('very_short', 'short', 'rich')),
  do_not_write       boolean not null default false,
  do_not_write_scope text not null default 'none' check (do_not_write_scope in ('none', 'point', 'topic')),
  model_call_id      uuid,
  created_at         timestamptz not null default now(),
  check (
    (refusal = false and refusal_scope = 'none' and refused_point is null)
    or (
      refusal = true
      and refusal_scope in ('point', 'topic')
      and refused_point is not null
      and length(btrim(refused_point)) > 0
    )
  ),
  check (
    (do_not_write = false and do_not_write_scope = 'none')
    or (do_not_write = true and do_not_write_scope in ('point', 'topic'))
  )
);

create type public.story_status as enum (
  'draft', 'needs_review', 'confirmed', 'user_confirmed', 'removed'
);

create table public.stories (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id),
  topic_id         text references public.topics (id),
  chapter_id       text not null references public.chapters (id),
  chapter_source   text not null default 'ai' check (chapter_source in ('ai', 'user')),
  title            text,
  summary          text,
  status           public.story_status not null default 'draft',
  current_version  int not null default 0,
  word_count       int,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index stories_user_chapter_status_idx on public.stories (user_id, chapter_id, status);
create index stories_topic_id_idx on public.stories (topic_id);
create index stories_user_id_idx on public.stories (user_id);

alter table public.sessions
  add constraint sessions_story_id_fkey
  foreign key (story_id) references public.stories (id);

create table public.pipeline_runs (
  id                  uuid primary key default gen_random_uuid(),
  story_id            uuid references public.stories (id),
  chapter_version_id  uuid,
  kind                text not null check (kind in ('story', 'chapter')),
  status              text not null default 'running' check (status in ('running', 'done', 'failed')),
  input_message_ids   uuid[] not null default '{}',
  extract_output      jsonb,
  structure_output    jsonb,
  draft_output        jsonb,
  verify_output       jsonb,
  dropped_sentences   jsonb,
  error               text,
  created_at          timestamptz not null default now(),
  finished_at         timestamptz,
  check (
    (kind = 'story' and story_id is not null)
    or (kind = 'chapter' and chapter_version_id is not null)
  )
);
create index pipeline_runs_story_id_idx on public.pipeline_runs (story_id);
create index pipeline_runs_chapter_version_id_idx on public.pipeline_runs (chapter_version_id);

create type public.source_level as enum ('self', 'confirmed', 'family');

create table public.facts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id),
  story_id       uuid references public.stories (id),
  run_id         uuid not null references public.pipeline_runs (id),
  kind           text not null check (kind in (
    'event', 'person', 'place', 'time', 'object', 'sensory', 'quote', 'meaning'
  )),
  text           text not null,
  source_level   public.source_level not null,
  certainty      text not null default 'sure' check (certainty in ('sure', 'unsure')),
  unsure_note    text,
  message_ids    uuid[] not null,
  superseded_by  uuid references public.facts (id),
  created_at     timestamptz not null default now(),
  check (cardinality(message_ids) > 0)
);
create index facts_story_id_idx on public.facts (story_id);
create index facts_user_id_idx on public.facts (user_id);
create index facts_run_id_idx on public.facts (run_id);
create index facts_superseded_by_idx on public.facts (superseded_by);

create table public.chapter_versions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id),
  chapter_id   text not null references public.chapters (id),
  version      int not null,
  story_order  uuid[] not null,
  word_count   int,
  created_at   timestamptz not null default now(),
  unique (user_id, chapter_id, version)
);
create index chapter_versions_user_id_idx on public.chapter_versions (user_id);
create index chapter_versions_chapter_id_idx on public.chapter_versions (chapter_id);

alter table public.pipeline_runs
  add constraint pipeline_runs_chapter_version_id_fkey
  foreign key (chapter_version_id) references public.chapter_versions (id);

create table public.sentences (
  id                   uuid primary key default gen_random_uuid(),
  story_id             uuid references public.stories (id),
  chapter_version_id   uuid references public.chapter_versions (id),
  version              int not null,
  position             int not null,
  text                 text not null,
  locked               boolean not null default false,
  fact_ids             uuid[] not null default '{}',
  message_ids          uuid[] not null,
  created_at           timestamptz not null default now(),
  check (cardinality(message_ids) > 0),
  check ((story_id is not null) <> (chapter_version_id is not null))
);
create unique index sentences_story_version_position_idx
  on public.sentences (story_id, version, position)
  where story_id is not null;
create unique index sentences_chapter_position_idx
  on public.sentences (chapter_version_id, version, position)
  where chapter_version_id is not null;

create function private.protect_locked_sentence()
returns trigger
language plpgsql
as $$
begin
  if old.locked and (new.text is distinct from old.text or new.locked is distinct from true) then
    raise exception 'locked sentences cannot be changed';
  end if;
  return new;
end;
$$;

create trigger sentences_lock
  before update on public.sentences
  for each row execute function private.protect_locked_sentence();

revoke all on function private.protect_locked_sentence() from public;

create table public.uncertain_items (
  id           uuid primary key default gen_random_uuid(),
  sentence_id  uuid not null references public.sentences (id),
  span         text not null,
  user_prompt  text not null,
  resolved     boolean not null default false,
  resolution   text,
  created_at   timestamptz not null default now()
);
create index uncertain_items_sentence_id_idx on public.uncertain_items (sentence_id);

create table public.followup_gaps (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (id),
  story_id          uuid references public.stories (id),
  topic_id          text references public.topics (id),
  about             text not null,
  next_question     text not null,
  priority          int not null default 1,
  asked_message_id  uuid references public.messages (id),
  created_at        timestamptz not null default now()
);
create index followup_gaps_open_idx
  on public.followup_gaps (user_id, topic_id, priority, created_at)
  where asked_message_id is null;
create index followup_gaps_story_id_idx on public.followup_gaps (story_id);
create index followup_gaps_asked_message_id_idx on public.followup_gaps (asked_message_id);
create index followup_gaps_user_id_idx on public.followup_gaps (user_id);

alter table public.messages
  add constraint messages_gap_id_fkey
  foreign key (gap_id) references public.followup_gaps (id)
  deferrable initially deferred;

create table public.memory_profile (
  user_id       uuid not null references public.users (id),
  key           text not null,
  value         text not null,
  source_level  public.source_level not null,
  message_ids   uuid[] not null,
  locked        boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (user_id, key),
  check (cardinality(message_ids) > 0)
);

create table public.people (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id),
  name         text not null,
  relation     text,
  message_ids  uuid[] not null,
  story_ids    uuid[] not null default '{}',
  updated_at   timestamptz not null default now(),
  check (cardinality(message_ids) > 0)
);
create index people_user_id_idx on public.people (user_id);

create table public.refused_points (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id),
  topic_id    text references public.topics (id),
  point       text not null,
  message_id  uuid not null references public.messages (id),
  -- refusal: do not ask again. do_not_write: keep the words, but writing steps must not use them.
  kind        text not null default 'refusal' check (kind in ('refusal', 'do_not_write')),
  created_at  timestamptz not null default now(),
  unique (message_id, kind)
);
create index refused_points_user_topic_idx on public.refused_points (user_id, topic_id);
create index refused_points_topic_id_idx on public.refused_points (topic_id);

create table public.model_calls (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.users (id),
  session_id      uuid references public.sessions (id),
  run_id          uuid references public.pipeline_runs (id),
  step            text not null check (step in (
    'classify', 'interview', 'extract', 'structure', 'draft', 'verify', 'chapter',
    'simulated_elder', 'judge'
  )),
  provider        text not null,
  model           text not null,
  input_tokens    int,
  output_tokens   int,
  cost_usd        numeric(12, 6),
  latency_ms      int,
  first_token_ms  int,
  ok              boolean not null default true,
  error           text,
  created_at      timestamptz not null default now()
);
create index model_calls_session_created_idx on public.model_calls (session_id, created_at);
create index model_calls_user_created_idx on public.model_calls (user_id, created_at);
create index model_calls_run_id_idx on public.model_calls (run_id);

alter table public.turn_classifications
  add constraint turn_classifications_model_call_id_fkey
  foreign key (model_call_id) references public.model_calls (id);

create index turn_classifications_model_call_id_idx
  on public.turn_classifications (model_call_id);

-- The Next.js server connects as the table owner and bypasses RLS.
-- Enabling RLS with no policies blocks the Supabase Data API roles.
alter table public.chapters enable row level security;
alter table public.users enable row level security;
alter table public.topics enable row level security;
alter table public.topic_states enable row level security;
alter table public.sessions enable row level security;
alter table public.messages enable row level security;
alter table public.turn_classifications enable row level security;
alter table public.stories enable row level security;
alter table public.pipeline_runs enable row level security;
alter table public.facts enable row level security;
alter table public.chapter_versions enable row level security;
alter table public.sentences enable row level security;
alter table public.uncertain_items enable row level security;
alter table public.followup_gaps enable row level security;
alter table public.memory_profile enable row level security;
alter table public.people enable row level security;
alter table public.refused_points enable row level security;
alter table public.model_calls enable row level security;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on all tables in schema public from %I', role_name);
      execute format('revoke all on all sequences in schema public from %I', role_name);
      execute format('revoke usage on schema public from %I', role_name);
    end if;
  end loop;
end $$;
