-- Thessa WhatsApp Bot - Supabase base schema
-- Run in Supabase SQL Editor

create extension if not exists "pgcrypto";

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  name text,
  phase text not null default 'nuevo_chat',
  status text not null default 'abierto',
  last_message text not null default '',
  last_at timestamptz not null default now(),
  last_direction text,
  incoming_count int not null default 0,
  outgoing_count int not null default 0,
  unread_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversations_phase on conversations(phase);
create index if not exists idx_conversations_last_at on conversations(last_at desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  message_id text unique,
  phone_number text not null references conversations(phone_number) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  source text not null default 'bot',
  type text not null default 'text',
  text text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_phone_created on messages(phone_number, created_at desc);

create table if not exists chat_summaries (
  phone_number text primary key references conversations(phone_number) on delete cascade,
  summary text not null default '',
  intent text not null default 'otro',
  sentiment text not null default 'neutral',
  next_step text not null default '',
  highlights jsonb not null default '[]'::jsonb,
  customer_context jsonb not null default '{}'::jsonb,
  detailed_context jsonb,
  detailed_context_updated_at timestamptz,
  pending_message_count int not null default 0,
  status text not null default 'pending',
  last_summarized_at timestamptz,
  last_message_created_at timestamptz,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_summaries_updated_at
on chat_summaries(updated_at desc);

alter table chat_summaries
add column if not exists detailed_context jsonb;

alter table chat_summaries
add column if not exists detailed_context_updated_at timestamptz;

create table if not exists conversation_controls (
  phone_number text primary key references conversations(phone_number) on delete cascade,
  mode text not null default 'bot' check (mode in ('bot', 'human', 'assisted_flow')),
  taken_by text,
  reason text not null default '',
  taken_at timestamptz,
  released_at timestamptz,
  assisted_flow jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversation_controls_mode
on conversation_controls(mode);

alter table conversation_controls
add column if not exists assisted_flow jsonb;

create table if not exists clients (
  phone_number text primary key,
  name text,
  email text,
  notes text,
  birthday_day int check (birthday_day between 1 and 31),
  birthday_month int check (birthday_month between 1 and 12),
  responsible text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  name text,
  service_id text,
  service_name text not null,
  duration_minutes int,
  people int,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'confirmada', 'cancelada', 'expirada')),
  event_id text,
  confirmed_at timestamptz,
  reminders jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Actualiza instalaciones existentes que fueron creadas antes del estado "expirada".
alter table appointments drop constraint if exists appointments_status_check;
alter table appointments add constraint appointments_status_check
  check (status in ('pendiente', 'confirmada', 'cancelada', 'expirada'));

create index if not exists idx_appointments_phone_start on appointments(phone_number, start_at desc);
create index if not exists idx_appointments_status_start on appointments(status, start_at);
create index if not exists idx_appointments_active_start on appointments(start_at)
where status in ('pendiente', 'confirmada');

create table if not exists service_categories (
  id text primary key,
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_categories_active_sort
on service_categories(active, sort_order, name);

create table if not exists services (
  id text primary key,
  category_id text not null references service_categories(id) on delete cascade,
  name text not null,
  description text not null default '',
  duration_minutes int,
  price numeric(12,2),
  image text not null default '',
  benefits jsonb not null default '[]'::jsonb,
  problems jsonb not null default '[]'::jsonb,
  keywords jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_services_category_name_unique
on services(category_id, name);

create index if not exists idx_services_active_category_sort
on services(active, category_id, sort_order, name);

create table if not exists service_prices (
  id uuid primary key default gen_random_uuid(),
  service_id text not null references services(id) on delete cascade,
  people int not null,
  price numeric(12,2) not null,
  exclusive boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(service_id, people)
);

create index if not exists idx_service_prices_service_people
on service_prices(service_id, people);

create table if not exists service_faqs (
  id text primary key,
  question text not null,
  answer text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_faqs_active_sort
on service_faqs(active, sort_order, question);

create table if not exists bot_state (
  key text primary key,
  value text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bot_state_expires_at on bot_state(expires_at);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_conversations_updated_at on conversations;
create trigger trg_conversations_updated_at
before update on conversations
for each row execute procedure set_updated_at();

drop trigger if exists trg_clients_updated_at on clients;
create trigger trg_clients_updated_at
before update on clients
for each row execute procedure set_updated_at();

drop trigger if exists trg_appointments_updated_at on appointments;
create trigger trg_appointments_updated_at
before update on appointments
for each row execute procedure set_updated_at();

drop trigger if exists trg_service_categories_updated_at on service_categories;
create trigger trg_service_categories_updated_at
before update on service_categories
for each row execute procedure set_updated_at();

drop trigger if exists trg_services_updated_at on services;
create trigger trg_services_updated_at
before update on services
for each row execute procedure set_updated_at();

drop trigger if exists trg_service_prices_updated_at on service_prices;
create trigger trg_service_prices_updated_at
before update on service_prices
for each row execute procedure set_updated_at();

drop trigger if exists trg_service_faqs_updated_at on service_faqs;
create trigger trg_service_faqs_updated_at
before update on service_faqs
for each row execute procedure set_updated_at();

drop trigger if exists trg_bot_state_updated_at on bot_state;
create trigger trg_bot_state_updated_at
before update on bot_state
for each row execute procedure set_updated_at();

-- Tabla de campañas/enlaces de seguimiento
create table if not exists campaigns (
  id text primary key, -- Código corto, ej: 'fb-jun', 'ig-bio'
  lead_code text unique, -- Código visible y breve enviado en WhatsApp, ej: 'PL01'
  name text not null, -- Nombre de la campaña
  source text not null, -- Canal de origen (ej: facebook, instagram, qr-volante)
  medium text, -- Medio de adquisición (ej: cpc, bio, qr)
  prefilled_text text, -- Mensaje predefinido a enviar por WhatsApp
  clicks int not null default 0, -- Cantidad de visitas del enlace
  leads_count int not null default 0, -- Conversiones exitosas (chats iniciados)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table campaigns add column if not exists lead_code text unique;

-- Tabla para evitar doble contabilización de conversión por el mismo número
create table if not exists campaign_leads (
  campaign_id text references campaigns(id) on delete cascade,
  phone_number text not null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, phone_number)
);

create table if not exists campaign_funnel_events (
  campaign_id text references campaigns(id) on delete cascade,
  phone_number text not null,
  stage text not null check (stage in ('contacted', 'appointment_created', 'captured')),
  appointment_id uuid references appointments(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (campaign_id, phone_number, stage)
);

create index if not exists idx_campaign_funnel_events_campaign
on campaign_funnel_events(campaign_id, stage);

-- Modificar tabla clients para asociar el origen
alter table clients add column if not exists campaign_id text references campaigns(id) on delete set null;
alter table clients add column if not exists responsible text;
alter table clients add column if not exists birthday_day int check (birthday_day between 1 and 31);
alter table clients add column if not exists birthday_month int check (birthday_month between 1 and 12);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clients'
      and column_name = 'birthday'
  ) then
    update clients
    set
      birthday_day = coalesce(
        birthday_day,
        case
          when birthday ~* '^\s*\d{1,2}\s*[/-]\s*\d{1,2}' then substring(birthday from '^\s*(\d{1,2})')::int
          when birthday ~* '\d{1,2}' then substring(birthday from '(\d{1,2})')::int
          else null
        end
      ),
      birthday_month = coalesce(
        birthday_month,
        case
          when birthday ~* '^\s*\d{1,2}\s*[/-]\s*\d{1,2}' then substring(birthday from '^\s*\d{1,2}\s*[/-]\s*(\d{1,2})')::int
          when birthday ~* 'enero' then 1
          when birthday ~* 'febrero' then 2
          when birthday ~* 'marzo' then 3
          when birthday ~* 'abril' then 4
          when birthday ~* 'mayo' then 5
          when birthday ~* 'junio' then 6
          when birthday ~* 'julio' then 7
          when birthday ~* 'agosto' then 8
          when birthday ~* 'septiembre|setiembre' then 9
          when birthday ~* 'octubre' then 10
          when birthday ~* 'noviembre' then 11
          when birthday ~* 'diciembre' then 12
          else null
        end
      )
    where birthday is not null;

    update clients
    set birthday_day = null, birthday_month = null
    where birthday_day is not null
      and birthday_month is not null
      and (
        birthday_month < 1 or birthday_month > 12 or
        birthday_day < 1 or
        birthday_day > case birthday_month
          when 2 then 29
          when 4 then 30
          when 6 then 30
          when 9 then 30
          when 11 then 30
          else 31
        end
      );

    alter table clients drop column if exists birthday;
  end if;
end $$;

-- Trigger para updated_at en campaigns
drop trigger if exists trg_campaigns_updated_at on campaigns;
create trigger trg_campaigns_updated_at
before update on campaigns
for each row execute procedure set_updated_at();

create or replace function increment_campaign_clicks(campaign_key text)
returns setof campaigns
language sql
security definer
set search_path = public
as $$
  update campaigns
  set clicks = clicks + 1
  where id = campaign_key
  returning *;
$$;

create or replace function register_campaign_lead(campaign_key text, lead_phone text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into campaign_leads (campaign_id, phone_number)
  values (campaign_key, lead_phone)
  on conflict do nothing;

  if not found then
    return false;
  end if;

  update campaigns
  set leads_count = leads_count + 1
  where id = campaign_key;

  return true;
end;
$$;
