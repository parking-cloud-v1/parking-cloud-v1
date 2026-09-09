-- 智驛停車平台 第4段
-- 報表中心 Google Drive 正式歸檔紀錄
-- 用途：防止完全相同內容重複歸檔，同來源內容有更新時仍可建立新版。

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
    'attendance',
    'rentals',
    'changes',
    'taxi',
    'shift',
    'disaster',
    'dengue',
    'violation'
  ));

create unique index if not exists report_center_drive_archives_dedupe_uidx
  on public.report_center_drive_archives (
    category,
    report_month,
    source_key,
    content_sha256
  );

create index if not exists report_center_drive_archives_month_category_idx
  on public.report_center_drive_archives (report_month, category);

create index if not exists report_center_drive_archives_lot_month_idx
  on public.report_center_drive_archives (parking_lot_id, report_month);

create index if not exists report_center_drive_archives_archived_at_idx
  on public.report_center_drive_archives (archived_at desc);

alter table public.report_center_drive_archives enable row level security;

-- 此表只由 Server API 使用 SUPABASE_SERVICE_ROLE_KEY 寫入/讀取。
-- 不建立 authenticated 直連政策，可避免前端直接偽造 Drive 歸檔紀錄。

comment on table public.report_center_drive_archives is
  '報表中心 Google Drive 歸檔稽核與內容去重紀錄';

comment on column public.report_center_drive_archives.source_key is
  '穩定來源識別，例如 attendance:<id>、rentals:<parking_lot_id>';

comment on column public.report_center_drive_archives.content_sha256 is
  '實際上傳內容 SHA-256；相同來源內容改變時可建立新版';
