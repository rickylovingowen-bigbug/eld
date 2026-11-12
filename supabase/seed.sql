-- Baseline user row for `supabase db reset`.
-- Topic and chapter rows are loaded from config/*.json by `pnpm db:seed`
-- (and by the app on startup). JSON files are the source of truth.
insert into public.users (id, display_name, ui_locale, narration_locale, book_title)
values (
  '11111111-1111-4111-8111-111111111111',
  'Ricky',
  'en',
  'en',
  'Ricky''s story'
)
on conflict (id) do nothing;
