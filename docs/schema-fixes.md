# Schema fixes vs `docs/schema-v1.sql`

The migration in `supabase/migrations/` keeps the draft's rules: messages are append-only, every sentence cites at least one message, each writing step is stored on its own row, and a locked sentence cannot be rewritten.

Changes:

- Named indexes on foreign keys, including the partial index for the one open follow-up gap per user and topic.
- Row Level Security is enabled on every public table and Supabase `anon` / `authenticated` grants are revoked when those roles exist. The Next.js server connects as the table owner, which bypasses RLS. There is no auth in v0.1, so there are no policies.
- Trigger functions live in the `private` schema and are not executable by `public`.
- `chapters` holds the ten chapter ids from `config/memoir-topics-v3.json`. Topic, story, and off-topic fields reference it.
- `turn_classifications` adds `do_not_write` and `do_not_write_scope` (`none` / `point` / `topic`). Scope `topic` is only for an explicit "the whole topic stays out of the book."
- `refused_points.kind` is `refusal` or `do_not_write`. A refusal is kept out of later questions. A do-not-write mark keeps the original message and tells the v0.2 writing query to skip it. One message can carry both kinds.
- `messages.in_reply_to` plus a partial unique index gives one assistant reply per user message, so a retry cannot double-insert.
- `messages.kind` records opening, follow-up, cap prompt, refusal, distress, stop, reassure, and the v0.2 gap question.
- `sessions.awaiting` records the cap opt-in and the "stop asking about this topic" confirmation. `last_activity_at` orders the Continue card.
- Checks: a classification's refusal and do-not-write flags match their scopes; a sentence belongs to a story or a chapter version, not both; facts, people, and profile rows cite at least one message; session status is `open`, `ended`, or `abandoned`.
- `cost_usd` is `numeric(12,6)`.
- `audio_url` and `audio_span` stay nullable. v0.1 has no microphone UI.

`opening_gap` is read from `followup_gaps` and passed into the interviewer prompt. The table is empty until v0.2 writes gaps.
