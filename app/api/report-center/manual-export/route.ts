import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'
import {
  REPORT_CATEGORIES,
  REPORT_CATEGORY_META,
  collectReportItems,
  itemBytes,
  safeName,
  type LotRow,
  type ReportCategory,
} from '@/lib/report-center-export'

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

async function authorize() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { user: null, profile: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,is_active')
    .eq('id', user.id)
    .maybeSingle()

  return { user, profile }
}

async function allowedLots(db: ReturnType<typeof admin>, userId: string, role: string) {
  let query = db.from('parking_lots').select('id,name').eq('status', 'active').order('name')

  if (role === 'manager') {
    const { data: assignments, error } = await db
      .from('user_parking_lots')
      .select('parking_lot_id')
      .eq('user_id', userId)

    if (error) throw new Error(`停車場權限讀取失敗：${error.message}`)

    const ids = Array.from(
      new Set(
        (assignments || [])
          .map((row: any) => String(row.parking_lot_id || ''))
          .filter(Boolean)
      )
    )

    if (!ids.length) return [] as LotRow[]
    query = query.in('id', ids)
  }

  const { data, error } = await query
  if (error) throw new Error(`停車場讀取失敗：${error.message}`)
  return (data || []) as LotRow[]
}

export async function GET(request: Request) {
  try {
    const { user, profile } = await authorize()
    if (!user || !profile?.is_active || !['supervisor', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: '沒有報表中心權限。' }, { status: 403 })
    }

    const url = new URL(request.url)
    const month = String(url.searchParams.get('month') || '').trim()
    const category = String(url.searchParams.get('category') || '') as ReportCategory

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: '月份格式錯誤。' }, { status: 400 })
    }
    if (!REPORT_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: '下載類型錯誤。' }, { status: 400 })
    }

    const db = admin()
    const lots = await allowedLots(db, user.id, profile.role)
    if (!lots.length) {
      return NextResponse.json({ error: '目前沒有指派可下載的停車場。' }, { status: 403 })
    }

    // Drive 與本機備份共用同一個來源產生器，避免兩邊欄位/格式再度不一致。
    const items = await collectReportItems(db, category, month, lots)
    if (!items.length) {
      return NextResponse.json({ error: '這個月份沒有可下載的資料。' }, { status: 404 })
    }

    const zip = new JSZip()
    let added = 0
    const failures: string[] = []

    for (const item of items) {
      try {
        const bytes = await itemBytes(db, item)
        zip.file(`${safeName(item.parkingLotName)}/${item.fileName}`, bytes)
        added++
      } catch (error: any) {
        failures.push(`${item.parkingLotName}／${item.fileName}：${error?.message || '下載失敗'}`)
      }
    }

    if (!added) {
      return NextResponse.json(
        { error: failures.length ? failures.slice(0, 3).join('；') : '沒有可下載的檔案。' },
        { status: 500 }
      )
    }

    if (failures.length) {
      zip.file('下載失敗清單.txt', failures.join('\r\n'))
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
        parking_lot_id: profile.role === 'manager' && lots.length === 1 ? lots[0].id : null,
        action: 'REPORT_CENTER_LOCAL_BACKUP_DOWNLOAD',
        entity_type: 'report_center',
        entity_id: null,
        detail: {
          category,
          month,
          file_count: added,
          failed_count: failures.length,
          role: profile.role,
        },
      })
    } catch {
      // 稽核紀錄失敗不阻止下載。
    }

    const label = REPORT_CATEGORY_META[category].label
    const fileName = `${month}_${safeName(label)}_備份.zip`

    return new NextResponse(responseBody, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="report-backup.zip"; filename*=UTF-8''${encodeURIComponent(
          fileName
        )}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '報表下載失敗。' },
      { status: 500 }
    )
  }
}
