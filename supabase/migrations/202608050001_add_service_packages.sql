create table if not exists public.service_packages (
  id uuid primary key default gen_random_uuid(),
  service_id text not null references public.services(id) on delete cascade,
  name text not null,
  sessions int not null check (sessions > 1),
  price numeric(12,2) not null check (price >= 0),
  description text not null default '',
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_service_packages_service_active on public.service_packages(service_id, active, sort_order);
drop trigger if exists trg_service_packages_updated_at on public.service_packages;
create trigger trg_service_packages_updated_at before update on public.service_packages for each row execute procedure set_updated_at();
