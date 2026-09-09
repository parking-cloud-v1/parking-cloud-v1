-- 智驛停車平台 第5段最終整合 migration
-- 目的：正式角色只保留 supervisor / manager，並保留 Google Drive 歸檔紀錄表。
-- 可重複執行；不刪除月租、電子合約、簽名或正式 PDF。

begin;

-- 舊 accountant 不自動升權。
-- role::text 可同時相容「role 是 enum」與「role 是 text」的既有資料庫。
update public.profiles
set role = 'manager',
    is_active = false,
    updated_at = now()
where role::text = 'accountant';

alter table public.profiles
  drop constraint if exists profiles_role_phase5_check;

alter table public.profiles
  add constraint profiles_role_phase5_check
  check (role::text in ('supervisor', 'manager'));

create extension if not exists pgcrypto;

create table if not exists public.report_center_drive_archives (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  report_month date not null,
  parking_lot_id uuid null,
  source_key text not null,
  content_sha256 text not null,
  file_name text not null,
  google_file_id text not null,
  google_folder_id text null,
  google_web_view_link text null,
  archived_by uuid null,
  archived_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.report_center_drive_archives
  drop constraint if exists report_center_drive_archives_category_check;

alter table public.report_center_drive_archives
  add constraint report_center_drive_archives_category_check
  check (category in (
    'attendance','rentals','changes','taxi','shift','disaster','dengue','violation'
  ));

create unique index if not exists report_center_drive_archives_dedupe_uidx
  on public.report_center_drive_archives(category, report_month, source_key, content_sha256);

create index if not exists report_center_drive_archives_month_category_idx
  on public.report_center_drive_archives(report_month, category);

create index if not exists report_center_drive_archives_lot_month_idx
  on public.report_center_drive_archives(parking_lot_id, report_month);

create index if not exists report_center_drive_archives_archived_at_idx
  on public.report_center_drive_archives(archived_at desc);

alter table public.report_center_drive_archives enable row level security;

comment on table public.report_center_drive_archives is
  '報表中心 Google Drive 歸檔稽核與內容去重紀錄';

commit;
