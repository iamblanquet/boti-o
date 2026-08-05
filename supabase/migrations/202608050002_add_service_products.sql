alter table services
add column if not exists products jsonb not null default '[]'::jsonb;
