-- A refusal can store the extracted point and the declined question on the same message.
alter table public.refused_points drop constraint if exists refused_points_message_id_kind_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'refused_points_message_id_kind_point_key'
  ) then
    alter table public.refused_points
      add constraint refused_points_message_id_kind_point_key unique (message_id, kind, point);
  end if;
end $$;
