import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type DengueRow = {
  id: string
  parking_lot_id: string
  work_date: string
  work_type: string
  file_kind: 'photo' | 'report' | null
  storage_path: string
  file_name: string
  mime_type: string | null
  uploaded_at: string
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('伺服器環境變數未設定完整')
  }

  return createAdminClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function safeName(value: unknown) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .trim()
}

async function authorize() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      user: null,
      profile: null,
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,is_active')
    .eq('id', user.id)
    .maybeSingle()

  return {
    user,
    profile,
  }
}

async function canAccessParkingLot(
  db: ReturnType<typeof admin>,
  userId: string,
  role: string,
  parkingLotId: string
) {
  if (role === 'supervisor') return true
  if (role !== 'manager') return false

  const { data, error } = await db
    .from('user_parking_lots')
    .select('parking_lot_id')
    .eq('user_id', userId)
    .eq('parking_lot_id', parkingLotId)
    .maybeSingle()

  if (error) {
    throw new Error(`停車場權限讀取失敗：${error.message}`)
  }

  return Boolean(data)
}

function fileFolder(row: DengueRow) {
  const workType = row.work_type === '委外消毒' ? '委外消毒' : '自主檢查'
  const kind = row.file_kind === 'report' ? '報表' : '照片'
  return `${workType}/${kind}`
}

export async function GET(request: Request) {
  try {
    const { user, profile } = await authorize()

    if (
      !user ||
      !profile?.is_active ||
      !['supervisor', 'manager'].includes(String(profile.role || ''))
    ) {
      return NextResponse.json({ error: '沒有下載權限。' }, { status: 403 })
    }

    const url = new URL(request.url)
    const parkingLotId = String(url.searchParams.get('parkingLotId') || '').trim()
    const date = String(url.searchParams.get('date') || '').trim()

    if (!parkingLotId) {
      return NextResponse.json({ error: '缺少停車場。' }, { status: 400 })
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: '日期格式錯誤。' }, { status: 400 })
    }

    const db = admin()
    const allowed = await canAccessParkingLot(
      db,
      user.id,
      String(profile.role),
      parkingLotId
    )

    if (!allowed) {
      return NextResponse.json({ error: '沒有這個停車場的下載權限。' }, { status: 403 })
    }

    const { data: lot, error: lotError } = await db
      .from('parking_lots')
      .select('id,name')
      .eq('id', parkingLotId)
      .maybeSingle()

    if (lotError) {
      return NextResponse.json({ error: lotError.message }, { status: 500 })
    }

    const { data, error } = await db
      .from('dengue_prevention_photos')
      .select(
        'id,parking_lot_id,work_date,work_type,file_kind,storage_path,file_name,mime_type,uploaded_at'
      )
      .eq('parking_lot_id', parkingLotId)
      .eq('work_date', date)
      .order('work_type')
      .order('file_kind')
      .order('uploaded_at')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (data || []) as DengueRow[]

    if (!rows.length) {
      return NextResponse.json({ error: '這一天沒有可下載的登革熱作業資料。' }, { status: 404 })
    }

    const lotName = safeName(lot?.name || '停車場')
    const rootFolder = `${date}_${lotName}_登革熱消毒`
    const zip = new JSZip()
    let downloaded = 0
    const failures: string[] = []

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]

      if (!row.storage_path) continue

      try {
        const { data: blob, error: downloadError } = await db.storage
          .from('dengue-prevention')
          .download(row.storage_path)

        if (downloadError || !blob) {
          throw new Error(downloadError?.message || '找不到 Storage 檔案')
        }

        const originalName = safeName(row.file_name || `file_${index + 1}`)
        const numberedName = `${String(index + 1).padStart(2, '0')}_${originalName}`

        zip.file(
          `${rootFolder}/${fileFolder(row)}/${numberedName}`,
          await blob.arrayBuffer()
        )
        downloaded++
      } catch (fileError: any) {
        failures.push(`${row.file_name}：${fileError?.message || '下載失敗'}`)
      }
    }

    if (!downloaded) {
      return NextResponse.json(
        {
          error: failures.length
            ? `當日檔案都無法下載：${failures.slice(0, 3).join('；')}`
            : '這一天沒有可下載的檔案。',
        },
        { status: 500 }
      )
    }

    if (failures.length) {
      zip.file(
        `${rootFolder}/下載失敗清單.txt`,
        `以下檔案未能加入此 ZIP：\r\n${failures.join('\r\n')}`
      )
    }

    const bytes = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    // NextResponse / BodyInit 在目前 Next.js + TypeScript 型別下
    // 不直接接受 JSZip 回傳的 Uint8Array<ArrayBufferLike>。
    // 複製成標準 ArrayBuffer，內容完全相同，只修正 build 型別。
    const responseBody = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(responseBody).set(bytes)

    try {
      await db.from('system_logs').insert({
        user_id: user.id,
        parking_lot_id: parkingLotId,
        action: 'DENGUE_DAILY_FOLDER_DOWNLOAD',
        entity_type: 'dengue_prevention',
        entity_id: null,
        detail: {
          work_date: date,
          file_count: downloaded,
          failed_count: failures.length,
        },
      })
    } catch {
      // 稽核紀錄失敗不阻止下載。
    }

    const fileName = `${date}_${lotName}_登革熱消毒.zip`

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="dengue-${date}.zip"; filename*=UTF-8''${encodeURIComponent(
          fileName
        )}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '每日資料夾下載失敗。' },
      { status: 500 }
    )
  }
}
