-- 智驛停車平台｜第3段：違規停車照片＋主管即時通知完整整合
-- 可重複執行。請先執行本 SQL，再覆蓋程式檔案。

begin;

create extension if not exists pgcrypto;

-- 1. 違規案件欄位相容
create table if not exists public.violation_parking_cases (
  id uuid primary key default gen_random_uuid()
);

alter table public.violation_parking_cases
  add column if not exists parking_lot_id uuid,
  add column if not exists case_type text,
  add column if not exists reserved_type text,
  add column if not exists vehicle_plate text,
  add column if not exists location_text text,
  add column if not exists start_date date,
  add column if not exists notes text,
  add column if not exists status text default 'active',
  add column if not exists supervisor_status text default 'pending',
  add column if not exists supervisor_seen_at timestamptz,
  add column if not exists handled_at timestamptz,
  add column if not exists handled_by uuid,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.violation_parking_cases
set status = 'active'
where status is null or btrim(status) = '';

update public.violation_parking_cases
set supervisor_status = 'pending'
where supervisor_status is null or btrim(supervisor_status) = '';

-- 2. 照片欄位相容
create table if not exists public.violation_parking_photos (
  id uuid primary key default gen_random_uuid()
);

alter table public.violation_parking_photos
  add column if not exists case_id uuid,
  add column if not exists parking_lot_id uuid,
  add column if not exists photo_type text,
  add column if not exists photo_date date,
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint,
  add column if not exists uploaded_by uuid,
  add column if not exists uploaded_at timestamptz default now();

-- 若舊資料只有 case_id，補回 parking_lot_id。
update public.violation_parking_photos p
set parking_lot_id = c.parking_lot_id
from public.violation_parking_cases c
where p.case_id = c.id
  and p.parking_lot_id is null
  and c.parking_lot_id is not null;

-- 3. 查詢索引
create index if not exists violation_cases_lot_created_idx
  on public.violation_parking_cases(parking_lot_id, created_at desc);

create index if not exists violation_cases_supervisor_status_idx
  on public.violation_parking_cases(supervisor_status, created_at desc);

create index if not exists violation_photos_case_idx
  on public.violation_parking_photos(case_id, photo_date, photo_type);

create index if not exists violation_photos_lot_date_idx
  on public.violation_parking_photos(parking_lot_id, photo_date desc);

-- 4. Private Storage bucket
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'violation-parking',
  'violation-parking',
  false,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = excluded.allowed_mime_types;

-- 5. 建立本模組專用停車場權限判斷。
-- supervisor = 全場；manager = 僅 user_parking_lots 指派場。
create or replace function public.can_access_violation_lot(p_lot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (
        p.role = 'supervisor'
        or (
          p.role = 'manager'
          and exists (
            select 1
            from public.user_parking_lots upl
            where upl.user_id = auth.uid()
              and upl.parking_lot_id = p_lot_id
          )
        )
      )
  );
$$;

grant execute on function public.can_access_violation_lot(uuid) to authenticated;

-- 6. 資料表 RLS
alter table public.violation_parking_cases enable row level security;
alter table public.violation_parking_photos enable row level security;

grant select, insert, update on public.violation_parking_cases to authenticated;
grant select, insert, update, delete on public.violation_parking_photos to authenticated;

drop policy if exists "violation_cases_select" on public.violation_parking_cases;
drop policy if exists "violation_cases_insert" on public.violation_parking_cases;
drop policy if exists "violation_cases_update" on public.violation_parking_cases;

drop policy if exists "violation_photos_select" on public.violation_parking_photos;
drop policy if exists "violation_photos_insert" on public.violation_parking_photos;
drop policy if exists "violation_photos_update" on public.violation_parking_photos;
drop policy if exists "violation_photos_delete" on public.violation_parking_photos;

create policy "violation_cases_select"
on public.violation_parking_cases
for select
to authenticated
using (
  parking_lot_id is not null
  and public.can_access_violation_lot(parking_lot_id)
);

create policy "violation_cases_insert"
on public.violation_parking_cases
for insert
to authenticated
with check (
  parking_lot_id is not null
  and public.can_access_violation_lot(parking_lot_id)
);

create policy "violation_cases_update"
on public.violation_parking_cases
for update
to authenticated
using (
  parking_lot_id is not null
  and public.can_access_violation_lot(parking_lot_id)
)
with check (
  parking_lot_id is not null
  and public.can_access_violation_lot(parking_lot_id)
);

create policy "violation_photos_select"
on public.violation_parking_photos
for select
to authenticated
using (
  parking_lot_id is not null
  and public.can_access_violation_lot(parking_lot_id)
);

create policy "violation_photos_insert"
on public.violation_parking_photos
for insert
to authenticated
with check (
  parking_lot_id is not null
  and public.can_access_violation_lot(parking_lot_id)
);

create policy "violation_photos_update"
on public.violation_parking_photos
for update
to authenticated
using (
  parking_lot_id is not null
  and public.can_access_violation_lot(parking_lot_id)
)
with check (
  parking_lot_id is not null
  and public.can_access_violation_lot(parking_lot_id)
);

create policy "violation_photos_delete"
on public.violation_parking_photos
for delete
to authenticated
using (
  parking_lot_id is not null
  and public.can_access_violation_lot(parking_lot_id)
);

-- 7. Storage RLS：Private bucket；主管可全場，管理員只能自己的場。
drop policy if exists "violation_parking_storage_select" on storage.objects;
drop policy if exists "violation_parking_storage_insert" on storage.objects;
drop policy if exists "violation_parking_storage_update" on storage.objects;
drop policy if exists "violation_parking_storage_delete" on storage.objects;

create policy "violation_parking_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'violation-parking'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (
        p.role = 'supervisor'
        or (
          p.role = 'manager'
          and exists (
            select 1
            from public.user_parking_lots upl
            where upl.user_id = auth.uid()
              and upl.parking_lot_id::text = split_part(storage.objects.name, '/', 1)
          )
        )
      )
  )
);

create policy "violation_parking_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'violation-parking'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (
        p.role = 'supervisor'
        or (
          p.role = 'manager'
          and exists (
            select 1
            from public.user_parking_lots upl
            where upl.user_id = auth.uid()
              and upl.parking_lot_id::text = split_part(storage.objects.name, '/', 1)
          )
        )
      )
  )
);

create policy "violation_parking_storage_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'violation-parking'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (
        p.role = 'supervisor'
        or (
          p.role = 'manager'
          and exists (
            select 1
            from public.user_parking_lots upl
            where upl.user_id = auth.uid()
              and upl.parking_lot_id::text = split_part(storage.objects.name, '/', 1)
          )
        )
      )
  )
)
with check (
  bucket_id = 'violation-parking'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (
        p.role = 'supervisor'
        or (
          p.role = 'manager'
          and exists (
            select 1
            from public.user_parking_lots upl
            where upl.user_id = auth.uid()
              and upl.parking_lot_id::text = split_part(storage.objects.name, '/', 1)
          )
        )
      )
  )
);

create policy "violation_parking_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'violation-parking'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (
        p.role = 'supervisor'
        or (
          p.role = 'manager'
          and exists (
            select 1
            from public.user_parking_lots upl
            where upl.user_id = auth.uid()
              and upl.parking_lot_id::text = split_part(storage.objects.name, '/', 1)
          )
        )
      )
  )
);

commit;

select 'phase3 violation parking ready' as result;
