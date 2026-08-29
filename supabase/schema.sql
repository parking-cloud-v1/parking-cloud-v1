-- 智驛停車營運雲端平台 V1 / 第一階段
create extension if not exists pgcrypto;

create type public.app_role as enum ('supervisor','manager');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.app_role not null default 'manager',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parking_lots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  address text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_parking_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  parking_lot_id uuid not null references public.parking_lots(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, parking_lot_id)
);

create table if not exists public.system_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id),
  parking_lot_id uuid references public.parking_lots(id),
  action text not null,
  entity_type text,
  entity_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,display_name,role)
  values(new.id,coalesce(new.raw_user_meta_data->>'display_name',new.email),'manager')
  on conflict(id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_supervisor()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='supervisor' and p.is_active=true)
$$;

create or replace function public.can_access_lot(lot_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_supervisor() or exists(
    select 1 from public.user_parking_lots upl
    join public.profiles p on p.id=upl.user_id
    where upl.user_id=auth.uid() and upl.parking_lot_id=lot_id and p.is_active=true
  )
$$;

alter table public.profiles enable row level security;
alter table public.parking_lots enable row level security;
alter table public.user_parking_lots enable row level security;
alter table public.system_logs enable row level security;

create policy "profiles self or supervisor read" on public.profiles for select using (id=auth.uid() or public.is_supervisor());
create policy "supervisor manage profiles" on public.profiles for update using (public.is_supervisor()) with check (public.is_supervisor());
create policy "accessible lots read" on public.parking_lots for select using (public.can_access_lot(id));
create policy "supervisor insert lots" on public.parking_lots for insert with check (public.is_supervisor());
create policy "supervisor update lots" on public.parking_lots for update using (public.is_supervisor()) with check (public.is_supervisor());
create policy "user lot links read" on public.user_parking_lots for select using (user_id=auth.uid() or public.is_supervisor());
create policy "supervisor manage lot links" on public.user_parking_lots for all using (public.is_supervisor()) with check (public.is_supervisor());
create policy "logs read supervisor" on public.system_logs for select using (public.is_supervisor());
create policy "logs insert authenticated" on public.system_logs for insert with check (auth.uid()=user_id);

-- 建立第一位主管：先在 Supabase Authentication 建立帳號後，再執行：
-- update public.profiles set role='supervisor' where id='該帳號 UUID';
