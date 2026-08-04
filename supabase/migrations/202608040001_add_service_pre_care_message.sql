alter table public.services
add column if not exists pre_care_message text not null default '';
