-- Migration: Add Multi-Tenant tables and constraints
-- Path: supabase/migrations/20260630_add_auth_tables.sql

-- Drop existing tables to ensure clean deployment
drop table if exists sessions cascade;
drop table if exists employees cascade;
drop table if exists companies cascade;

-- 1. Create companies table
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique, -- e.g. 'thessa'
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for company slug search
create index if not exists idx_companies_slug on companies(slug);
create index if not exists idx_companies_active on companies(active);

-- Trigger for updated_at on companies
drop trigger if exists trg_companies_updated_at on companies;
create trigger trg_companies_updated_at
before update on companies
for each row execute procedure set_updated_at();

-- 2. Create employees table (updated with company relation)
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade, -- Null means Super Admin (global system administrator)
  username text not null unique,
  password_hash text not null,
  name text not null,
  role text not null default 'employee' check (role in ('superadmin', 'admin', 'employee')),
  permissions jsonb not null default '[]'::jsonb, -- Array of module keys
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for employee lookups
create index if not exists idx_employees_username on employees(username);
create index if not exists idx_employees_company on employees(company_id);
create index if not exists idx_employees_active on employees(active);

-- Trigger for updated_at on employees
drop trigger if exists trg_employees_updated_at on employees;
create trigger trg_employees_updated_at
before update on employees
for each row execute procedure set_updated_at();

-- 3. Create sessions table
create table if not exists sessions (
  token uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Index for token validation
create index if not exists idx_sessions_token_expires on sessions(token, expires_at);
