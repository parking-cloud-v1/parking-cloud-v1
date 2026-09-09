-- 智驛停車平台
-- 第1段：結班報表「未匯款跨班累積」
-- 執行方式：Supabase SQL Editor 整份執行一次
-- 功能：
-- 1. 每班 remittance_total 保留本班金額
-- 2. 同停車場 remittance_status = accumulating 的班別視為同一待匯款池
-- 3. 按「匯款完成」時透過 RPC 一次結清同場全部累積中班別
-- 4. 每筆已匯款資料保留 batch_id / batch_total / batch_report_count，供歷史查詢

begin;

create extension if not exists pgcrypto;

alter table public.shift_closing_reports
  add column if not exists remittance_total numeric(14,2) not null default 0;

alter table public.shift_closing_reports
  add column if not exists remittance_status text not null default 'accumulating';

alter table public.shift_closing_reports
  add column if not exists remitted_at timestamptz;

alter table public.shift_closing_reports
  add column if not exists remitted_by uuid;

alter table public.shift_closing_reports
  add column if not exists remittance_batch_id uuid;

alter table public.shift_closing_reports
  add column if not exists remittance_batch_total numeric(14,2);

alter table public.shift_closing_reports
  add column if not exists remittance_batch_report_count integer;

-- 舊資料若 status 為 NULL，統一視為尚未匯款。
update public.shift_closing_reports
set remittance_status = 'accumulating'
where remittance_status is null
   or btrim(remittance_status) = '';

-- 舊版已匯款資料沒有批次欄位時，先視為「單筆一批」，避免歷史頁顯示空白。
update public.shift_closing_reports
set
  remittance_batch_id = coalesce(remittance_batch_id, gen_random_uuid()),
  remittance_batch_total = coalesce(remittance_batch_total, remittance_total, 0),
  remittance_batch_report_count = coalesce(remittance_batch_report_count, 1)
where remittance_status = 'remitted'
  and (
    remittance_batch_id is null
    or remittance_batch_total is null
    or remittance_batch_report_count is null
  );

create index if not exists idx_shift_closing_reports_lot_remittance_status
  on public.shift_closing_reports (parking_lot_id, remittance_status);

create index if not exists idx_shift_closing_reports_remittance_batch_id
  on public.shift_closing_reports (remittance_batch_id)
  where remittance_batch_id is not null;

-- 原子化整批結清。
-- 使用 text 參數是為了相容 parking_lot_id 為 uuid 或 text 的既有專案。
create or replace function public.complete_shift_closing_remittance(
  p_parking_lot_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_batch_id uuid := gen_random_uuid();
  v_remitted_at timestamptz := now();
  v_total numeric(14,2) := 0;
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception '登入狀態已失效';
  end if;

  if p_parking_lot_id is null or btrim(p_parking_lot_id) = '' then
    raise exception '缺少停車場 ID';
  end if;

  -- 同一停車場同時間只允許一個匯款結清交易，避免重複點擊或多人同時操作。
  perform pg_advisory_xact_lock(
    hashtextextended(
      'shift_closing_remittance:' || p_parking_lot_id,
      0
    )
  );

  select
    coalesce(sum(coalesce(remittance_total, 0)), 0),
    count(*)::integer
  into
    v_total,
    v_count
  from public.shift_closing_reports
  where parking_lot_id::text = p_parking_lot_id
    and coalesce(remittance_status, 'accumulating') = 'accumulating';

  if v_count = 0 then
    raise exception '目前沒有可結清的未匯款結班資料';
  end if;

  update public.shift_closing_reports
  set
    remittance_status = 'remitted',
    remitted_at = v_remitted_at,
    remitted_by = v_user_id,
    remittance_batch_id = v_batch_id,
    remittance_batch_total = v_total,
    remittance_batch_report_count = v_count,
    updated_by = v_user_id,
    updated_at = v_remitted_at
  where parking_lot_id::text = p_parking_lot_id
    and coalesce(remittance_status, 'accumulating') = 'accumulating';

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'batch_total', v_total,
    'report_count', v_count,
    'remitted_at', v_remitted_at
  );
end;
$$;

revoke all on function public.complete_shift_closing_remittance(text) from public;
grant execute on function public.complete_shift_closing_remittance(text) to authenticated;

commit;
