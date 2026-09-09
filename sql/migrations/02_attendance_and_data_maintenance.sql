-- 智驛停車平台｜第2段：簽到表上傳 + 主管資料維護
-- 可重複執行。
-- 目的：
-- 1. 同一停車場、同一月份允許多份簽到表。
-- 2. 只有「同場 + 同月 + 同檔名（忽略大小寫）」才禁止重複。
-- 3. 補齊簽到表欄位、Private Storage bucket 與必要索引。
-- 4. 維持 manager / supervisor 的簽到表存取相容；accountant 保留讀取權。

begin;

create extension if not exists pgcrypto;

create table if not exists public.monthly_attendance_sheets (
  id uuid primary key default gen_random_uuid()
);

alter table public.monthly_attendance_sheets
  add column if not exists parking_lot_id uuid,
  add column if not exists attendance_month date,
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint,
  add column if not exists uploaded_by uuid,
  add column if not exists uploaded_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- 舊版若存在「同場同月只能一筆」唯一限制，必須移除，否則第二位管理員無法再上傳。
alter table public.monthly_attendance_sheets
  drop constraint if exists monthly_attendance_sheets_parking_lot_id_attendance_month_key;

drop index if exists public.monthly_attendance_lot_month_uidx;
drop index if exists public.monthly_attendance_sheets_parking_lot_id_attendance_month_key;

-- 新版：同場同月可多份。若現有資料沒有重複檔名，再加上「同場 + 同月 + 同檔名」唯一保護。
-- 若舊資料本來就有重複，不刪資料、不讓 migration 失敗；Server API 仍會阻止新重複上傳。
do $$
begin
  if not exists (
    select 1
    from public.monthly_attendance_sheets
    where parking_lot_id is not null
      and attendance_month is not null
      and file_name is not null
    group by parking_lot_id, attendance_month, lower(file_name)
    having count(*) > 1
  ) then
    execute 'create unique index if not exists monthly_attendance_lot_month_filename_uidx
      on public.monthly_attendance_sheets (parking_lot_id, attendance_month, lower(file_name))
      where parking_lot_id is not null and attendance_month is not null and file_name is not null';
  else
    raise notice '既有簽到表存在同場同月同檔名重複資料；保留原資料，暫不建立唯一索引。';
  end if;
end
$$;

create index if not exists monthly_attendance_lot_month_idx
  on public.monthly_attendance_sheets (
    parking_lot_id,
    attendance_month desc,
    uploaded_at desc
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'monthly-attendance',
  'monthly-attendance',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.monthly_attendance_sheets enable row level security;

grant select, insert, update, delete
on public.monthly_attendance_sheets
to authenticated;

-- 僅刪除本版本自己的 policy，避免誤刪其他模組可能共用的政策。
drop policy if exists "monthly_attendance_select_v2" on public.monthly_attendance_sheets;
drop policy if exists "monthly_attendance_insert_v2" on public.monthly_attendance_sheets;
drop policy if exists "monthly_attendance_update_v2" on public.monthly_attendance_sheets;
drop policy if exists "monthly_attendance_delete_v2" on public.monthly_attendance_sheets;

create policy "monthly_attendance_select_v2"
on public.monthly_attendance_sheets
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, false) = true
      and (
        p.role::text in ('supervisor', 'accountant')
        or (
          p.role::text = 'manager'
          and exists (
            select 1
            from public.user_parking_lots upl
            where upl.user_id = auth.uid()
              and upl.parking_lot_id = monthly_attendance_sheets.parking_lot_id
          )
        )
      )
  )
);

create policy "monthly_attendance_insert_v2"
on public.monthly_attendance_sheets
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, false) = true
      and (
        p.role::text = 'supervisor'
        or (
          p.role::text = 'manager'
          and exists (
            select 1
            from public.user_parking_lots upl
            where upl.user_id = auth.uid()
              and upl.parking_lot_id = monthly_attendance_sheets.parking_lot_id
          )
        )
      )
  )
);

create policy "monthly_attendance_update_v2"
on public.monthly_attendance_sheets
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, false) = true
      and (
        p.role::text = 'supervisor'
        or (
          p.role::text = 'manager'
          and exists (
            select 1
            from public.user_parking_lots upl
            where upl.user_id = auth.uid()
              and upl.parking_lot_id = monthly_attendance_sheets.parking_lot_id
          )
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, false) = true
      and (
        p.role::text = 'supervisor'
        or (
          p.role::text = 'manager'
          and exists (
            select 1
            from public.user_parking_lots upl
            where upl.user_id = auth.uid()
              and upl.parking_lot_id = monthly_attendance_sheets.parking_lot_id
          )
        )
      )
  )
);

create policy "monthly_attendance_delete_v2"
on public.monthly_attendance_sheets
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, false) = true
      and (
        p.role::text = 'supervisor'
        or (
          p.role::text = 'manager'
          and exists (
            select 1
            from public.user_parking_lots upl
            where upl.user_id = auth.uid()
              and upl.parking_lot_id = monthly_attendance_sheets.parking_lot_id
          )
        )
      )
  )
);

-- Storage 仍維持 Private。Server API 使用 service role；以下政策保留既有後台直接讀取相容。
drop policy if exists "monthly_attendance_storage_select_v2" on storage.objects;
drop policy if exists "monthly_attendance_storage_insert_v2" on storage.objects;
drop policy if exists "monthly_attendance_storage_update_v2" on storage.objects;
drop policy if exists "monthly_attendance_storage_delete_v2" on storage.objects;

create policy "monthly_attendance_storage_select_v2"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'monthly-attendance'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, false) = true
      and (
        p.role::text in ('supervisor', 'accountant')
        or (
          p.role::text = 'manager'
          and exists (
            select 1
            from public.user_parking_lots upl
            where upl.user_id = auth.uid()
              and upl.parking_lot_id::text = (storage.foldername(name))[1]
          )
        )
      )
  )
);

create policy "monthly_attendance_storage_insert_v2"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'monthly-attendance'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, false) = true
      and (
        p.role::text = 'supervisor'
        or (
          p.role::text = 'manager'
          and exists (
            select 1
            from public.user_parking_lots upl
            where upl.user_id = auth.uid()
              and upl.parking_lot_id::text = (storage.foldername(name))[1]
          )
        )
      )
  )
);

create policy "monthly_attendance_storage_update_v2"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'monthly-attendance'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, false) = true
      and (
        p.role::text = 'supervisor'
        or (
          p.role::text = 'manager'
          and exists (
            select 1
            from public.user_parking_lots upl
            where upl.user_id = auth.uid()
              and upl.parking_lot_id::text = (storage.foldername(name))[1]
          )
        )
      )
  )
)
with check (
  bucket_id = 'monthly-attendance'
);

create policy "monthly_attendance_storage_delete_v2"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'monthly-attendance'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, false) = true
      and (
        p.role::text = 'supervisor'
        or (
          p.role::text = 'manager'
          and exists (
            select 1
            from public.user_parking_lots upl
            where upl.user_id = auth.uid()
              and upl.parking_lot_id::text = (storage.foldername(name))[1]
          )
        )
      )
  )
);

commit;

select
  id as bucket_id,
  public as bucket_public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'monthly-attendance';

select 'phase2 attendance + data maintenance ready' as result;
