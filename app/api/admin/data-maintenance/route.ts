import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type ModuleKey =
  | 'attendance'
  | 'dengue'
  | 'violation'
  | 'disaster'
  | 'shift'
  | 'taxi'

type ModuleConfig = {
  table: string
  bucket: string | null
  date: string | null
  label: string
}

const MODULES: Record<ModuleKey, ModuleConfig> = {
  attendance: {
    table: 'monthly_attendance_sheets',
    bucket: 'monthly-attendance',
    date: 'attendance_month',
    label: '簽到表',
  },
  dengue: {
    table: 'dengue_prevention_photos',
    bucket: 'dengue-prevention',
    date: 'work_date',
    label: '登革熱照片／報表',
  },
  violation: {
    table: 'violation_parking_photos',
    bucket: 'violation-parking',
    date: 'photo_date',
    label: '違規停車照片',
  },
  disaster: {
    table: 'disaster_inspection_photos',
    bucket: 'disaster-inspections',
    date: null,
    label: '防災照片',
  },
  shift: {
    table: 'shift_closing_reports',
    bucket: null,
    date: 'closing_date',
    label: '結班報表',
  },
  taxi: {
    table: 'taxi_discount_records',
    bucket: null,
    date: 'discount_date',
    label: '計程車折扣',
  },
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('資料維護 Server API 缺少 SUPABASE_SERVICE_ROLE_KEY')
  }

  return createAdminClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function supervisor() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  return profile?.is_active && profile.role === 'supervisor'
    ? user
    : null
}

function moduleKey(value: string): ModuleKey | null {
  return Object.prototype.hasOwnProperty.call(MODULES, value)
    ? (value as ModuleKey)
    : null
}

function fieldsFor(key: ModuleKey) {
  if (key === 'attendance') {
    return 'id,parking_lot_id,attendance_month,file_name,mime_type,file_size,storage_path,uploaded_at'
  }

  if (key === 'dengue') {
    return 'id,parking_lot_id,work_date,work_type,file_kind,file_name,mime_type,file_size,storage_path,uploaded_at'
  }

  if (key === 'violation') {
    return 'id,parking_lot_id,photo_date,photo_type,file_name,mime_type,file_size,storage_path,uploaded_at'
  }

  if (key === 'disaster') {
    return 'id,inspection_id,file_name,storage_path,sort_order'
  }

  if (key === 'shift') {
    return 'id,parking_lot_id,closing_date,operator_name,amount_paid,remittance_total,remittance_status,created_at'
  }

  return 'id,parking_lot_id,discount_date,vehicle_plate,discount_amount,created_at'
}

async function enrichDisasterRows(db: any, rows: any[]) {
  const ids = Array.from(
    new Set(rows.map((row) => row.inspection_id).filter(Boolean))
  )

  if (!ids.length) return rows

  const { data: inspections } = await db
    .from('disaster_inspections')
    .select('id, parking_lot_id, inspection_date')
    .in('id', ids)

  const map = new Map((inspections || []).map((row: any) => [row.id, row]))

  return rows.map((row) => {
    const inspection: any = map.get(row.inspection_id)

    return {
      ...row,
      parking_lot_id: inspection?.parking_lot_id || null,
      inspection_date: inspection?.inspection_date || null,
    }
  })
}

async function readRow(db: any, key: ModuleKey, id: string) {
  const { data, error } = await db
    .from(MODULES[key].table)
    .select(fieldsFor(key))
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    throw new Error(error?.message || '找不到資料')
  }

  if (key === 'disaster') {
    return (await enrichDisasterRows(db, [data]))[0]
  }

  return data
}

export async function GET(request: Request) {
  try {
    const user = await supervisor()

    if (!user) {
      return NextResponse.json(
        { error: '只有主管可以使用資料維護。' },
        { status: 403 }
      )
    }

    const url = new URL(request.url)
    const rawModule = String(url.searchParams.get('module') || 'attendance')
    const key = moduleKey(rawModule)
    const action = String(url.searchParams.get('action') || '').trim()
    const id = String(url.searchParams.get('id') || '').trim()
    const lot = String(url.searchParams.get('lot') || '').trim()
    const from = String(url.searchParams.get('from') || '').trim()
    const to = String(url.searchParams.get('to') || '').trim()

    if (!key) {
      return NextResponse.json(
        { error: '不支援的資料類型' },
        { status: 400 }
      )
    }

    const cfg = MODULES[key]
    const db = admin()

    if (action === 'preview') {
      if (!id) {
        return NextResponse.json(
          { error: '缺少預覽資料 ID。' },
          { status: 400 }
        )
      }

      if (!cfg.bucket) {
        return NextResponse.json(
          { error: '此資料類型沒有可預覽的 Storage 檔案。' },
          { status: 400 }
        )
      }

      const row = await readRow(db, key, id)

      if (!row.storage_path) {
        return NextResponse.json(
          { error: '這筆資料沒有實體檔案。' },
          { status: 404 }
        )
      }

      const { data, error } = await db.storage
        .from(cfg.bucket)
        .createSignedUrl(row.storage_path, 60 * 10)

      if (error || !data?.signedUrl) {
        return NextResponse.json(
          { error: error?.message || '預覽網址建立失敗。' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        ok: true,
        fileName: row.file_name || cfg.label,
        signedUrl: data.signedUrl,
      })
    }

    let query = db
      .from(cfg.table)
      .select(fieldsFor(key))
      .limit(200)

    if (lot && key !== 'disaster') {
      query = query.eq('parking_lot_id', lot)
    }

    if (cfg.date && from) {
      query = query.gte(cfg.date, from)
    }

    if (cfg.date && to) {
      query = query.lte(cfg.date, to)
    }

    if (cfg.date) {
      query = query.order(cfg.date, { ascending: false })
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    let rows = (data || []) as any[]

    if (key === 'disaster') {
      rows = await enrichDisasterRows(db, rows)

      if (lot) {
        rows = rows.filter((row) => row.parking_lot_id === lot)
      }

      if (from) {
        rows = rows.filter(
          (row) => !row.inspection_date || row.inspection_date >= from
        )
      }

      if (to) {
        rows = rows.filter(
          (row) => !row.inspection_date || row.inspection_date <= to
        )
      }

      rows.sort((a, b) =>
        String(b.inspection_date || '').localeCompare(
          String(a.inspection_date || '')
        )
      )
    }

    return NextResponse.json({ rows })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '資料維護讀取失敗。' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await supervisor()

    if (!user) {
      return NextResponse.json(
        { error: '只有主管可以刪除資料。' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const key = moduleKey(String(body?.module || ''))
    const id = String(body?.id || '').trim()

    if (!key || !id) {
      return NextResponse.json(
        { error: '缺少刪除資料' },
        { status: 400 }
      )
    }

    const cfg = MODULES[key]
    const db = admin()
    const row = await readRow(db, key, id)

    let deleteError: any = null

    const firstDelete = await db
      .from(cfg.table)
      .delete()
      .eq('id', id)

    deleteError = firstDelete.error

    // 舊版結班資料庫若沒有 ON DELETE CASCADE，補做相容清理後重試。
    if (deleteError && key === 'shift') {
      await db.from('shift_closing_details').delete().eq('report_id', id)
      await db.from('shift_closing_machines').delete().eq('report_id', id)

      const retry = await db
        .from(cfg.table)
        .delete()
        .eq('id', id)

      deleteError = retry.error
    }

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      )
    }

    let storageWarning = ''

    if (cfg.bucket && row.storage_path) {
      const { error: storageError } = await db.storage
        .from(cfg.bucket)
        .remove([row.storage_path])

      if (storageError) {
        storageWarning = `資料庫紀錄已刪除，但 Storage 實體檔案清除失敗：${storageError.message}`
      }
    }

    try {
      await db.from('system_logs').insert({
        user_id: user.id,
        parking_lot_id: row.parking_lot_id || null,
        action: 'SUPERVISOR_DATA_DELETE',
        entity_type: cfg.table,
        entity_id: id,
        detail: {
          module: key,
          label: cfg.label,
          file_name: row.file_name || null,
          storage_path: row.storage_path || null,
          storage_warning: storageWarning || null,
        },
      })
    } catch {
      // 刪除已完成；log 失敗不回滾。
    }

    return NextResponse.json({
      ok: true,
      warning: storageWarning || null,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '資料刪除失敗。' },
      { status: 500 }
    )
  }
}
