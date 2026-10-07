-- 線上簽約安全鎖 V1.2
-- 目的：已簽契約正式作廢前先封存舊版本，保留 PDF / 簽名 / Hash 證據，
-- 再退回既有重新審核流程。此 migration 為加法式設計，不刪除既有資料。

create extension if not exists pgcrypto;

create table if not exists public.contract_revision_archives (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete restrict,
  application_id uuid null,
  parking_lot_id uuid not null references public.parking_lots(id) on delete restrict,
  revision_no integer not null,
  contract_no text null,
  document_hash text null,
  contract_snapshot jsonb not null,
  signature_snapshot jsonb null,
  signed_archive_snapshot jsonb null,
  signature_path text null,
  signature_hash text null,
  pdf_path text null,
  pdf_hash text null,
  void_reason text not null,
  voided_at timestamptz not null default now(),
  voided_by uuid null,
  created_at timestamptz not null default now(),
  unique(contract_id, revision_no)
);

create index if not exists contract_revision_archives_contract_idx
  on public.contract_revision_archives(contract_id, revision_no desc);
create index if not exists contract_revision_archives_lot_idx
  on public.contract_revision_archives(parking_lot_id, created_at desc);

alter table public.contract_revision_archives enable row level security;

-- 僅登入且有場站權限的人可查看封存版本；寫入只走 server service role / RPC。
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='contract_revision_archives'
      and policyname='contract revision archives accessible lot read'
  ) then
    create policy "contract revision archives accessible lot read"
      on public.contract_revision_archives
      for select
      to authenticated
      using (public.can_access_lot(parking_lot_id));
  end if;
end $$;

revoke all on table public.contract_revision_archives from anon;
grant select on table public.contract_revision_archives to authenticated;

-- 已有正式 PDF 後禁止改寫核心檔案欄位；第一次由 NULL 寫入正式檔仍允許。
create or replace function public.guard_signed_contract_archive_immutability()
returns trigger
language plpgsql
as $$
begin
  if old.pdf_path is not null then
    if new.pdf_path is distinct from old.pdf_path
       or new.pdf_hash is distinct from old.pdf_hash
       or new.pdf_generated_at is distinct from old.pdf_generated_at
       or new.pdf_source_archive_hash is distinct from old.pdf_source_archive_hash
       or new.archive_hash is distinct from old.archive_hash then
      raise exception '正式契約 PDF 已封存，不可覆寫。';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_signed_contract_archive_immutability
  on public.signed_contract_archives;
create trigger trg_guard_signed_contract_archive_immutability
before update on public.signed_contract_archives
for each row execute function public.guard_signed_contract_archive_immutability();

-- 正式作廢：完整封存舊版本後，將目前契約退回 cancelled，供既有重新審核流程重建。
-- Storage 檔案不刪除；舊 PDF / 簽名路徑由 contract_revision_archives 永久保留參照。
create or replace function public.void_signed_contract_for_reissue(
  p_contract_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns table(revision_archive_id uuid, revision_no integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract public.contracts%rowtype;
  v_signature public.contract_signatures%rowtype;
  v_archive public.signed_contract_archives%rowtype;
  v_revision integer;
  v_revision_id uuid;
  v_now timestamptz := now();
begin
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception '正式作廢原因至少需 3 個字。';
  end if;

  select * into v_contract
  from public.contracts
  where id = p_contract_id
  for update;

  if not found then
    raise exception '找不到契約。';
  end if;

  if v_contract.status <> 'signed' or v_contract.signed_at is null then
    raise exception '只有已完成簽署的契約可以走正式作廢。';
  end if;

  select * into v_signature
  from public.contract_signatures
  where contract_id = p_contract_id
  limit 1;

  select * into v_archive
  from public.signed_contract_archives
  where contract_id = p_contract_id
  limit 1;

  select coalesce(max(cra.revision_no), 0) + 1
    into v_revision
  from public.contract_revision_archives cra
  where cra.contract_id = p_contract_id;

  insert into public.contract_revision_archives (
    contract_id, application_id, parking_lot_id, revision_no,
    contract_no, document_hash, contract_snapshot,
    signature_snapshot, signed_archive_snapshot,
    signature_path, signature_hash, pdf_path, pdf_hash,
    void_reason, voided_at, voided_by
  ) values (
    v_contract.id,
    v_contract.application_id,
    v_contract.parking_lot_id,
    v_revision,
    v_contract.contract_no,
    v_contract.document_hash,
    to_jsonb(v_contract),
    case when v_signature.id is null then null else to_jsonb(v_signature) end,
    case when v_archive.id is null then null else to_jsonb(v_archive) end,
    v_signature.handwritten_signature_path,
    v_signature.handwritten_signature_hash,
    v_archive.pdf_path,
    v_archive.pdf_hash,
    trim(p_reason),
    v_now,
    p_actor_user_id
  )
  returning id into v_revision_id;

  -- 只刪除「目前版本的資料列」，Storage 實體檔案保留，並由 revision archive 參照。
  delete from public.contract_signatures where contract_id = p_contract_id;
  delete from public.signed_contract_archives where contract_id = p_contract_id;

  update public.contracts
  set status = 'cancelled',
      cancelled_at = v_now,
      cancelled_by = p_actor_user_id,
      cancel_reason = trim(p_reason),
      sign_token_hash = null,
      sign_token_expires_at = null,
      sign_token_used_at = null,
      sign_invitation_status = 'cancelled',
      sign_invitation_error = null,
      signed_at = null,
      signer_privacy_agreed_at = null,
      signer_electronic_agreed_at = null,
      signer_contract_read_at = null,
      signer_data_confirmed_at = null,
      signer_non_fixed_space_agreed_at = null,
      pdf_path = null,
      pdf_hash = null,
      pdf_generated_at = null,
      updated_at = v_now
  where id = p_contract_id;

  if v_contract.application_id is not null then
    update public.rental_applications
    set status = 'pending',
        review_note = trim(p_reason),
        reviewed_by = p_actor_user_id,
        reviewed_at = v_now,
        updated_at = v_now
    where id = v_contract.application_id;
  end if;

  return query select v_revision_id, v_revision;
end;
$$;

revoke all on function public.void_signed_contract_for_reissue(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.void_signed_contract_for_reissue(uuid, uuid, text) to service_role;
