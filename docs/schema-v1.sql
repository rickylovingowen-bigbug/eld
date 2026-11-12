-- eld 童年内测版 数据表设计 v1（开发）
-- Postgres / 本地 Supabase。依据：产品需求文档 v1「信息链路」「数据与记录」、
-- turn-classifier-schema-v1.json、writing-pipeline-io-v1.md。
-- 原则：消息只增不改；每一步整理结果单独存、可重跑；用户改过的句子锁定。

create extension if not exists pgcrypto;

-- 1. 用户（内测写死一个，保留字段，以后加登录不改表）
create table users (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,
  ui_locale     text not null default 'en',          -- 界面语言 en / zh
  narration_locale text not null default 'en',       -- 讲述语言，中文待定
  book_title    text,                                -- 默认 "<name>'s story"
  created_at    timestamptz not null default now()
);

-- 2. 话头配置（从 childhood-topics-v1.json / memoir-topics-v3.json 导入，按版本存）
create table topics (
  id            text primary key,                    -- 例 childhood-house
  chapter_id    text not null,                       -- 十章之一，例 childhood
  config_version text not null,                      -- 例 childhood-v1
  title         jsonb not null,                      -- {"en": "...", "zh": "..."}
  opening_question text not null,
  follow_ups    jsonb not null default '[]',
  sensitive     boolean not null default false,
  recommend_by_default boolean not null default true,
  recommend_rank int                                  -- 推荐顺序，null = 不推荐
);

-- 3. 话头状态（每个用户每个话头一行）
create type topic_status as enum ('recommendable','told','not_now','do_not_write');
create table topic_states (
  user_id   uuid not null references users(id),
  topic_id  text not null references topics(id),
  status    topic_status not null default 'recommendable',
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);

-- 4. 对话（一次讲述一条）
create type entry_mode as enum ('topic','continue','tell_more','free');
create table sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id),
  topic_id      text references topics(id),          -- 自由讲为空
  story_id      uuid,                                -- 续讲时指向的故事（下方外键）
  entry_mode    entry_mode not null,
  followups_used int not null default 0,             -- 代码计数，上限 3
  extended_by_user boolean not null default false,   -- 用户要求继续后不再计数
  status        text not null default 'open',        -- open / ended / abandoned
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);

-- 5. 消息（用户和 AI 的每一条，只增不改）
create table messages (
  id            uuid primary key,                    -- 由网页端生成，重试幂等
  session_id    uuid not null references sessions(id),
  user_id       uuid not null references users(id),
  role          text not null check (role in ('user','assistant')),
  content       text not null,
  locale        text not null default 'en',
  audio_url     text,                                -- 预留，以后接语音
  audio_span    int4range,                           -- 预留，原声毫秒区间
  gap_id        uuid,                                -- AI 这句如果是在问缺口，指向待追问表
  created_at    timestamptz not null default now()
);
create index on messages (session_id, created_at);
-- 只增不改：禁止 update/delete
create or replace function forbid_change() returns trigger language plpgsql as
$$ begin raise exception 'messages are append-only'; end $$;
create trigger messages_append_only before update or delete on messages
  for each row execute function forbid_change();

-- 6. 回答判断（每条用户回答一条，字段同 turn-classifier-schema-v1.json）
create table turn_classifications (
  message_id        uuid primary key references messages(id),
  refusal           boolean not null,
  refusal_scope     text not null check (refusal_scope in ('none','point','topic')),
  refused_point     text,
  off_topic_chapter text,
  wants_to_stop     boolean not null,
  distress          text not null check (distress in ('none','mild','strong')),
  answer_length     text not null check (answer_length in ('very_short','short','rich')),
  model_call_id     uuid,
  created_at        timestamptz not null default now()
);

-- 7. 故事
create type story_status as enum ('draft','needs_review','confirmed','user_confirmed','removed');
create table stories (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id),
  topic_id      text references topics(id),
  chapter_id    text not null,                        -- 当前所属章节
  chapter_source text not null default 'ai' check (chapter_source in ('ai','user')), -- 用户改过就不再被覆盖
  title         text,
  summary       text,                                 -- 一句话摘要，喂给对话模型
  status        story_status not null default 'draft',
  current_version int not null default 0,
  word_count    int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table sessions add foreign key (story_id) references stories(id);

-- 8. 整理流水：每次整理一条，四步结果各存一份（可单独重跑）
create table pipeline_runs (
  id            uuid primary key default gen_random_uuid(),
  story_id      uuid references stories(id),
  chapter_version_id uuid,                            -- 整章时使用
  kind          text not null check (kind in ('story','chapter')),
  status        text not null default 'running',      -- running / done / failed
  input_message_ids uuid[] not null default '{}',     -- 本次处理的消息（增量）
  extract_output   jsonb,   -- 第 1 步 素材表原始输出
  structure_output jsonb,   -- 第 2 步 骨架
  draft_output     jsonb,   -- 第 3 步 成稿
  verify_output    jsonb,   -- 第 4 步 核对
  dropped_sentences jsonb,  -- 被代码删掉的句子，给评测用
  error         text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

-- 9. 素材表（第 1 步拆开存，便于合并和引用）
create type source_level as enum ('self','confirmed','family');
create table facts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id),
  story_id      uuid references stories(id),
  run_id        uuid not null references pipeline_runs(id),
  kind          text not null check (kind in ('event','person','place','time','object','sensory','quote','meaning')),
  text          text not null,
  source_level  source_level not null,
  certainty     text not null default 'sure' check (certainty in ('sure','unsure')),
  unsure_note   text,
  message_ids   uuid[] not null,                       -- 可以包含 AI 的提问
  superseded_by uuid references facts(id),             -- 合并时被替换
  created_at    timestamptz not null default now()
);
create index on facts (story_id);

-- 10. 句子（故事和整章共用）+ 出处
create table sentences (
  id            uuid primary key default gen_random_uuid(),
  story_id      uuid references stories(id),
  chapter_version_id uuid,
  version       int not null,
  position      int not null,
  text          text not null,
  locked        boolean not null default false,        -- 用户改过，任何一步不得修改
  fact_ids      uuid[] not null default '{}',
  message_ids   uuid[] not null,                       -- 直接对回原话，不能为空
  created_at    timestamptz not null default now(),
  check (cardinality(message_ids) > 0)                 -- 对不上原话的句子存不进来
);
create index on sentences (story_id, version, position);

-- 11. 待确认问题（上界面，琥珀色下划线）
create table uncertain_items (
  id            uuid primary key default gen_random_uuid(),
  sentence_id   uuid not null references sentences(id),
  span          text not null,                         -- 例 "1952"
  user_prompt   text not null,                         -- 例 "Was it 1952 or 1953?"
  resolved      boolean not null default false,
  resolution    text,
  created_at    timestamptz not null default now()
);

-- 12. 待追问表（缺口，不上界面）
create table followup_gaps (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id),
  story_id      uuid references stories(id),
  topic_id      text references topics(id),
  about         text not null,
  next_question text not null,
  priority      int not null default 1,
  asked_message_id uuid references messages(id),       -- 问过就填，不再问
  created_at    timestamptz not null default now()
);
create index on followup_gaps (user_id, topic_id) where asked_message_id is null;

-- 13. 对话记忆
create table memory_profile (                          -- 基本信息：出生年份、在哪长大等
  user_id       uuid not null references users(id),
  key           text not null,                         -- birth_year / hometown ...
  value         text not null,
  source_level  source_level not null,
  message_ids   uuid[] not null,
  locked        boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (user_id, key)
);
create table people (                                  -- 人物表（v1 无界面，照常存）
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id),
  name          text not null,
  relation      text,
  message_ids   uuid[] not null,
  story_ids     uuid[] not null default '{}',
  updated_at    timestamptz not null default now()
);
create table refused_points (                          -- 拒绝过的点，喂给对话模型避开
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id),
  topic_id      text references topics(id),
  point         text not null,
  message_id    uuid not null references messages(id),
  created_at    timestamptz not null default now()
);

-- 14. 整章版本（保留历史）
create table chapter_versions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id),
  chapter_id    text not null,
  version       int not null,
  story_order   uuid[] not null,
  word_count    int,
  created_at    timestamptz not null default now(),
  unique (user_id, chapter_id, version)
);
alter table sentences add foreign key (chapter_version_id) references chapter_versions(id);
alter table pipeline_runs add foreign key (chapter_version_id) references chapter_versions(id);

-- 15. 模型调用（内部，记成本和耗时）
create table model_calls (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references users(id),
  session_id    uuid references sessions(id),
  run_id        uuid references pipeline_runs(id),
  step          text not null,   -- classify / interview / extract / structure / draft / verify / chapter
  provider      text not null,
  model         text not null,
  input_tokens  int,
  output_tokens int,
  cost_usd      numeric(10,6),
  latency_ms    int,
  first_token_ms int,
  ok            boolean not null default true,
  error         text,
  created_at    timestamptz not null default now()
);
