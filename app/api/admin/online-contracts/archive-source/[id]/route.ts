import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function relationName(value: any) {
  if (Array.isArray(value)) return value[0]?.name || '-'
  return value?.name || '-'
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未登入。' }, { status: 401 })
  }

  const { data: row, error } = await supabase
    .from('contracts')
    .select(`
      id,contract_no,customer_code,customer_name,vehicle_plate,
      contract_version,contract_snapshot,document_hash,status,signed_at,
      parking_lots(name),
      contract_signatures(
        signer_name,verification_method,otp_verified,signed_at,
        privacy_agreed_at,electronic_agreed_at,
        electronic_signature_consent_at,contract_read_confirmed_at,
        data_confirmed_at,non_fixed_space_agreed_at,
        handwritten_signature_hash,handwritten_signature_at
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error || !row) {
    return NextResponse.json({ error: '找不到契約資料。' }, { status: 404 })
  }

  if (row.status !== 'signed' || !row.signed_at) {
    return NextResponse.json(
      { error: '只有已完成簽署的契約可以建立正式 PDF。' },
      { status: 409 }
    )
  }

  const { data: archive } = await supabase
    .from('signed_contract_archives')
    .select('archive_hash,pdf_path')
    .eq('contract_id', id)
    .maybeSingle()

  if (!archive) {
    return NextResponse.json(
      { error: '找不到此契約的正式封存資料。' },
      { status: 404 }
    )
  }

  const signature = Array.isArray(row.contract_signatures)
    ? row.contract_signatures[0]
    : row.contract_signatures

  return NextResponse.json({
    ok: true,
    pdf_ready: Boolean(archive.pdf_path),
    has_handwritten_signature: Boolean(signature?.handwritten_signature_at),
    input: {
      contractNo: row.contract_no,
      customerCode: row.customer_code || null,
      parkingLotName: relationName(row.parking_lots),
      contractVersion: row.contract_version || null,
      customerName: row.customer_name,
      vehiclePlate: row.vehicle_plate,
      contractSnapshot: row.contract_snapshot || '',
      documentHash: row.document_hash || null,
      archiveHash: archive.archive_hash || null,
      signedAt: row.signed_at || null,
      signature: signature || null,
    },
  })
}
