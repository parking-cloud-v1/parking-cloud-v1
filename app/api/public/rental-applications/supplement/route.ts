import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { consumePublicRateLimit, publicFailure, rateLimitResponse } from '@/lib/security/publicSecurity'

export const dynamic = 'force-dynamic'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function normalizePlate(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

function maskPhone(phone?: string | null) {
  if (!phone) return '-'
  if (phone.length < 7) return phone
  return `${phone.slice(0, 4)}***${phone.slice(-3)}`
}

function relationName(value: any) {
  if (Array.isArray(value)) return value[0]?.name || ''
  return value?.name || ''
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) return null

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

async function findApplication(admin: any, token: string) {
  const tokenHash = hashToken(token)
  const { data, error } = await admin
    .from('rental_applications')
    .select(`
      id, parking_lot_id, applicant_name, phone, email, vehicle_plate,
      vehicle_type, rental_type, address,
      emergency_contact_name, emergency_contact_phone,
      qualification_type, qualification_status, status,
      supplement_note, supplement_expires_at,
      parking_lots(name)
    `)
    .eq('supplement_token_hash', tokenHash)
    .maybeSingle()

  if (error || !data) return null
  if (data.status !== 'needs_revision') return null
  if (
    !data.supplement_expires_at ||
    new Date(data.supplement_expires_at).getTime() <= Date.now()
  ) {
    return null
  }

  return data
}

export async function GET(request: NextRequest) {
  try {
    const token = String(
      new URL(request.url).searchParams.get('token') || ''
    ).trim()

    if (!token) {
      return NextResponse.json({ error: '補件連結無效。' }, { status: 400 })
    }

    const admin = adminClient()
    if (!admin) {
      return NextResponse.json(
        { error: '服務暫時無法使用，請稍後再試。' },
        { status: 500 }
      )
    }

    const viewLimit = await consumePublicRateLimit(admin, request, {
      scope: 'supplement_view_ip',
      subject: hashToken(token),
      limit: 120,
      windowSeconds: 600,
    })
    if (!viewLimit.allowed) return rateLimitResponse(viewLimit)

    const row = await findApplication(admin, token)
    if (!row) {
      return NextResponse.json(
        { error: '補件連結不存在、已使用或已逾期。' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ok: true,
      application: {
        id: row.id,
        parking_lot_name: relationName(row.parking_lots) || '停車場',
        applicant_name: row.applicant_name,
        phone_masked: maskPhone(row.phone),
        email: row.email || '',
        vehicle_plate: row.vehicle_plate,
        vehicle_type: row.vehicle_type,
        rental_type: row.rental_type || '一般',
        address: row.address || '',
        emergency_contact_name: row.emergency_contact_name || '',
        emergency_contact_phone: row.emergency_contact_phone || '',
        qualification_type: row.qualification_type || 'none',
        supplement_note: row.supplement_note || '',
        supplement_expires_at: row.supplement_expires_at,
      },
    })
  } catch (error: any) {
    return publicFailure(
      'supplement-get',
      error,
      '補件資料暫時無法讀取，請稍後再試。',
      503
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const token = String(body?.token || '').trim()

    if (!token) {
      return NextResponse.json({ error: '補件連結無效。' }, { status: 400 })
    }

    const admin = adminClient()
    if (!admin) {
      return NextResponse.json(
        { error: '服務暫時無法使用，請稍後再試。' },
        { status: 500 }
      )
    }

    const submitLimit = await consumePublicRateLimit(admin, request, {
      scope: 'supplement_submit_ip',
      subject: hashToken(token),
      limit: 30,
      windowSeconds: 3600,
    })
    if (!submitLimit.allowed) return rateLimitResponse(submitLimit)

    const row = await findApplication(admin, token)
    if (!row) {
      return NextResponse.json(
        { error: '補件連結不存在、已使用或已逾期。' },
        { status: 404 }
      )
    }

    const applicantName = String(body?.applicant_name || '').trim()
    const vehiclePlate = normalizePlate(String(body?.vehicle_plate || ''))
    const email = String(body?.email || '').trim()
    const address = String(body?.address || '').trim()
    const emergencyName = String(body?.emergency_contact_name || '').trim()
    const emergencyPhone = String(body?.emergency_contact_phone || '')
      .replace(/\s+/g, '')
      .trim()

    if (
      applicantName.length > 100 ||
      vehiclePlate.length > 20 ||
      email.length > 254 ||
      address.length > 500 ||
      emergencyName.length > 100 ||
      emergencyPhone.length > 30
    ) {
      return NextResponse.json(
        { error: '補件內容過長，請確認資料後再送出。' },
        { status: 400 }
      )
    }

    if (!applicantName) {
      return NextResponse.json({ error: '請填寫姓名。' }, { status: 400 })
    }

    if (!vehiclePlate) {
      return NextResponse.json({ error: '請填寫車牌。' }, { status: 400 })
    }

    if (row.qualification_type === 'resident' && !address) {
      return NextResponse.json(
        { error: '里民／住戶資格請填寫聯絡地址。' },
        { status: 400 }
      )
    }

    if (emergencyPhone && !/^0\d{8,9}$/.test(emergencyPhone)) {
      return NextResponse.json(
        { error: '緊急聯絡電話格式不正確。' },
        { status: 400 }
      )
    }

    const { data: duplicate } = await admin
      .from('rental_applications')
      .select('id')
      .eq('parking_lot_id', row.parking_lot_id)
      .ilike('vehicle_plate', vehiclePlate)
      .neq('id', row.id)
      .in('status', [
        'pending',
        'needs_revision',
        'waiting',
        'approved',
        'contract_sent',
      ])
      .limit(1)

    if (duplicate?.length) {
      return NextResponse.json(
        { error: '此車牌目前已有其他申請案件，請確認車牌資料。' },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()
    const nextQualificationStatus =
      row.qualification_type && row.qualification_type !== 'none'
        ? 'pending'
        : 'not_required'

    const { error: updateError } = await admin
      .from('rental_applications')
      .update({
        applicant_name: applicantName,
        email: email || null,
        vehicle_plate: vehiclePlate,
        address: address || null,
        emergency_contact_name: emergencyName || null,
        emergency_contact_phone: emergencyPhone || null,
        qualification_status: nextQualificationStatus,
        status: 'pending',
        supplement_completed_at: now,
        supplement_token_hash: null,
        supplement_expires_at: null,
        updated_at: now,
      })
      .eq('id', row.id)
      .eq('status', 'needs_revision')

    if (updateError) {
      console.error('[supplement] update failed', updateError)
      return NextResponse.json(
        { error: '補件資料暫時無法儲存，請稍後再試。' },
        { status: 503 }
      )
    }

    await admin.from('online_application_reviews').insert({
      application_id: row.id,
      parking_lot_id: row.parking_lot_id,
      actor_user_id: null,
      actor_label: '申請人本人（補件連結）',
      action: 'SUPPLEMENT_COMPLETED',
      previous_status: 'needs_revision',
      new_status: 'pending',
      qualification_status: nextQualificationStatus,
      note: row.supplement_note || null,
      metadata: {
        vehicle_plate: vehiclePlate,
        completed_at: now,
      },
    })

    await admin.from('online_audit_logs').insert({
      actor_user_id: null,
      parking_lot_id: row.parking_lot_id,
      application_id: row.id,
      action: 'APPLICATION_SUPPLEMENT_COMPLETED',
      detail: {
        vehicle_plate: vehiclePlate,
        completed_at: now,
      },
    })

    return NextResponse.json({
      ok: true,
      status: 'pending',
      message: '補件資料已送出，案件已重新進入審核。',
    })
  } catch (error: any) {
    return publicFailure(
      'supplement-post',
      error,
      '補件資料暫時無法處理，請稍後再試。',
      503
    )
  }
}
