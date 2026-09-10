import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('伺服器環境變數未設定完整')
  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function safeName(value: unknown) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .trim()
}

function caseTypeText(row: any) {
  if (row?.case_type === 'reserved_violation') {
    return row?.reserved_type === 'disabled' ? '身障車格違規' : '婦幼車格違規'
  }
  if (row?.case_type === 'long_stay') return '場內久停車'
  return '無牌車輛'
}

function photoTypeText(value: string) {
  const labels: Record<string, string> = {
    overview: '車格和牌面全景',
    center_window: '置中全窗',
    right_window: '右側全窗',
    left_window: '左側全窗',
    daily: '每日追蹤',
    general: '現場照片',
  }
  return labels[value] || value || '照片'
}

function supervisorStatusText(value: string) {
  if (value === 'pending') return '待主管查看'
  if (value === 'seen') return '主管已查看'
  if (value === 'reported') return '已舉發'
  return value || '-'
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '登入狀態已失效。' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id,role,is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json(
        { error: `權限讀取失敗：${profileError.message}` },
        { status: 500 }
      )
    }

    if (!profile?.is_active || profile.role !== 'supervisor') {
      return NextResponse.json(
        { error: '只有主管可以下載違規案件資料夾。' },
        { status: 403 }
      )
    }

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: '缺少違規案件 ID。' }, { status: 400 })
    }

    const db = admin()
    const { data: caseRow, error: caseError } = await db
      .from('violation_parking_cases')
      .select(`
        id,
        parking_lot_id,
        case_type,
        reserved_type,
        vehicle_plate,
        location_text,
        start_date,
        notes,
        status,
        supervisor_status,
        supervisor_seen_at,
        handled_at,
        created_by,
        created_at,
        parking_lots (name)
      `)
      .eq('id', id)
      .maybeSingle()

    if (caseError) {
      return NextResponse.json({ error: caseError.message }, { status: 500 })
    }
    if (!caseRow) {
      return NextResponse.json({ error: '找不到違規案件。' }, { status: 404 })
    }

    const { data: photos, error: photoError } = await db
      .from('violation_parking_photos')
      .select('id,photo_type,photo_date,storage_path,file_name,mime_type,uploaded_at')
      .eq('case_id', id)
      .order('photo_date')
      .order('uploaded_at')

    if (photoError) {
      return NextResponse.json(
        { error: `照片資料讀取失敗：${photoError.message}` },
        { status: 500 }
      )
    }

    const lotValue = (caseRow as any).parking_lots
    const lotName = Array.isArray(lotValue)
      ? lotValue[0]?.name || '停車場'
      : lotValue?.name || '停車場'
    const typeLabel = caseTypeText(caseRow)
    const plate = caseRow.vehicle_plate || '無牌'
    const root = `${caseRow.start_date || '未填日期'}_${safeName(lotName)}_${safeName(
      typeLabel
    )}_${safeName(plate)}`

    const zip = new JSZip()
    const summary = [
      '智驛停車平台｜違規案件資料',
      '',
      `停車場：${lotName}`,
      `案件類型：${typeLabel}`,
      `車牌：${plate}`,
      `位置：${caseRow.location_text || '-'}`,
      `發現／開始日期：${caseRow.start_date || '-'}`,
      `主管處理狀態：${supervisorStatusText(caseRow.supervisor_status)}`,
      `建立時間：${caseRow.created_at || '-'}`,
      `主管查看時間：${caseRow.supervisor_seen_at || '-'}`,
      `舉發時間：${caseRow.supervisor_status === 'reported' ? caseRow.handled_at || '-' : '-'}`,
      '',
      `備註：${caseRow.notes || '無'}`,
      '',
      `照片張數：${(photos || []).length}`,
      `案件 ID：${caseRow.id}`,
    ].join('\r\n')

    zip.file(`${root}/案件資料.txt`, '\uFEFF' + summary)

    let downloaded = 0
    const failures: string[] = []

    for (let index = 0; index < (photos || []).length; index++) {
      const photo: any = (photos || [])[index]
      if (!photo.storage_path) continue

      try {
        const { data: blob, error } = await db.storage
          .from('violation-parking')
          .download(photo.storage_path)

        if (error || !blob) {
          throw new Error(error?.message || 'Storage 檔案不存在')
        }

        const extension = String(photo.file_name || '').split('.').pop() || 'jpg'
        const fileName = `${String(index + 1).padStart(2, '0')}_${
          photo.photo_date || caseRow.start_date || '日期未填'
        }_${safeName(photoTypeText(photo.photo_type))}.${safeName(extension)}`

        zip.file(`${root}/照片/${fileName}`, await blob.arrayBuffer())
        downloaded++
      } catch (error: any) {
        failures.push(`${photo.file_name || photo.id}：${error?.message || '下載失敗'}`)
      }
    }

    if (failures.length) {
      zip.file(`${root}/照片下載失敗清單.txt`, '\uFEFF' + failures.join('\r\n'))
    }

    const bytes = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    const responseBody = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(responseBody).set(bytes)

    try {
      await db.from('system_logs').insert({
        user_id: user.id,
        parking_lot_id: caseRow.parking_lot_id || null,
        action: 'VIOLATION_CASE_FOLDER_DOWNLOAD',
        entity_type: 'violation_parking_case',
        entity_id: id,
        detail: {
          case_type: caseRow.case_type,
          vehicle_plate: caseRow.vehicle_plate,
          photo_count: downloaded,
          failed_photo_count: failures.length,
        },
      })
    } catch {
      // 稽核紀錄失敗不阻止下載。
    }

    const downloadName = `${root}_案件資料.zip`

    return new NextResponse(responseBody, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="violation-case.zip"; filename*=UTF-8''${encodeURIComponent(
          downloadName
        )}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '違規案件資料夾下載失敗。' },
      { status: 500 }
    )
  }
}
