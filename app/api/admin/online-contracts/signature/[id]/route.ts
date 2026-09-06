import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const BUCKET = 'contract-handwritten-signatures'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('伺服器環境變數未設定完整。')
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '未登入。' }, { status: 401 })
    }

    const actorUserId = user.id

    const admin = serviceClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('role,is_active')
      .eq('id', actorUserId)
      .maybeSingle()

    if (!profile?.is_active) {
      return NextResponse.json({ error: '帳號未啟用。' }, { status: 403 })
    }

    if (!['supervisor', 'manager', 'accountant'].includes(profile.role)) {
      return NextResponse.json({ error: '沒有查看契約簽名的權限。' }, { status: 403 })
    }

    const { data: contract } = await admin
      .from('contracts')
      .select('id,parking_lot_id,status')
      .eq('id', id)
      .maybeSingle()

    if (!contract || contract.status !== 'signed') {
      return NextResponse.json({ error: '找不到已簽署契約。' }, { status: 404 })
    }

    if (profile.role === 'manager') {
      const { data: assignment } = await admin
        .from('user_parking_lots')
        .select('parking_lot_id')
        .eq('user_id', actorUserId)
        .eq('parking_lot_id', contract.parking_lot_id)
        .maybeSingle()

      if (!assignment) {
        return NextResponse.json({ error: '沒有此停車場的查看權限。' }, { status: 403 })
      }
    }

    const { data: signature } = await admin
      .from('contract_signatures')
      .select('handwritten_signature_path,handwritten_signature_hash')
      .eq('contract_id', id)
      .maybeSingle()

    if (!signature?.handwritten_signature_path) {
      return NextResponse.json({ error: '此契約沒有手寫簽名檔。' }, { status: 404 })
    }

    const { data: file, error: downloadError } = await admin.storage
      .from(BUCKET)
      .download(signature.handwritten_signature_path)

    if (downloadError || !file) {
      return NextResponse.json(
        { error: `手寫簽名讀取失敗：${downloadError?.message || '找不到檔案'}` },
        { status: 404 }
      )
    }

    const bytes = await file.arrayBuffer()

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="signature-${id}.png"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'X-Signature-SHA256': signature.handwritten_signature_hash || '',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '手寫簽名讀取失敗。' },
      { status: 500 }
    )
  }
}
