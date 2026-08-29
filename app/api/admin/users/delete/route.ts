import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const HISTORY_TABLES = [
  {
    table: 'monthly_rentals',
    column: 'created_by',
    label: '月租紀錄',
  },
  {
    table: 'monthly_waiting_list',
    column: 'created_by',
    label: '月租候補紀錄',
  },
  {
    table: 'taxi_discount_records',
    column: 'created_by',
    label: '計程車優惠紀錄',
  },
  {
    table: 'disaster_inspections',
    column: 'created_by',
    label: '防災檢查紀錄',
  },
  {
    table: 'disaster_inspection_photos',
    column: 'uploaded_by',
    label: '防災照片紀錄',
  },
  {
    table: 'system_logs',
    column: 'user_id',
    label: '系統操作紀錄',
  },
]

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()

    if (!currentUser) {
      return NextResponse.json(
        { error: '登入狀態已失效。' },
        { status: 401 }
      )
    }

    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', currentUser.id)
      .maybeSingle()

    if (
      !currentProfile ||
      currentProfile.role !== 'supervisor' ||
      currentProfile.is_active !== true
    ) {
      return NextResponse.json(
        { error: '只有啟用中的主管帳號可以刪除使用者。' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const userId = String(body?.userId || '').trim()

    if (!userId) {
      return NextResponse.json(
        { error: '缺少要刪除的使用者 ID。' },
        { status: 400 }
      )
    }

    if (userId === currentUser.id) {
      return NextResponse.json(
        { error: '不能刪除目前正在登入的主管帳號。' },
        { status: 400 }
      )
    }

    const {
      data: targetProfile,
      error: targetError,
    } = await supabase
      .from('profiles')
      .select('id, display_name, role')
      .eq('id', userId)
      .maybeSingle()

    if (targetError) {
      return NextResponse.json(
        { error: '讀取帳號資料失敗：' + targetError.message },
        { status: 500 }
      )
    }

    if (!targetProfile) {
      return NextResponse.json(
        { error: '找不到這個使用者帳號。' },
        { status: 404 }
      )
    }

    const usedHistory: string[] = []

    for (const item of HISTORY_TABLES) {
      const {
        count,
        error,
      } = await supabase
        .from(item.table)
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq(item.column, userId)

      if (error) {
        continue
      }

      if ((count || 0) > 0) {
        usedHistory.push(`${item.label} ${count} 筆`)
      }
    }

    if (usedHistory.length > 0) {
      return NextResponse.json(
        {
          error:
            '此帳號已有歷史資料，為避免破壞紀錄，不能永久刪除。請改用「停用帳號」。\n' +
            usedHistory.join('、'),
        },
        { status: 409 }
      )
    }

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          error:
            '尚未設定 SUPABASE_SERVICE_ROLE_KEY，因此目前不能永久刪除 Auth 帳號。',
        },
        { status: 500 }
      )
    }

    const admin = createAdminClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const { error: deleteError } =
      await admin.auth.admin.deleteUser(userId)

    if (deleteError) {
      return NextResponse.json(
        { error: 'Auth 帳號刪除失敗：' + deleteError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: '帳號已永久刪除。',
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          '刪除帳號時發生錯誤：' +
          (error?.message || '未知錯誤'),
      },
      { status: 500 }
    )
  }
}
