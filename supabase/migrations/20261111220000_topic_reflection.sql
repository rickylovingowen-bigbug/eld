-- One look-back question per topic, and the elder's answer kept verbatim.
alter table public.topic_states
  add column if not exists reflection_asked boolean not null default false,
  add column if not exists meaning_text text,
  add column if not exists meaning_message_id uuid;
