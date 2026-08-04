alter table public.services
add column if not exists post_care_message text not null default '';
