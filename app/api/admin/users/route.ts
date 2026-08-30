import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

type AppRole = 'supervisor' | 'manager'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()

    if (!currentUser) {
      return NextResponse.json(
        { error: '登入狀態已失效，請重新登入。' },
        { status: 401 }
      )
    }

    const { data: currentProfile, error: profileReadError } =
      await supabase
        .from('profiles')
        .select('id, role, is_active')
        .eq('id', currentUser.id)
        .maybeSingle()

    if (profileReadError) {
      return NextResponse.json(
        { error: '主管權限讀取失敗：' + profileReadError.message },
        { status: 500 }
      )
    }

    if (
      !currentProfile ||
      currentProfile.role !== 'supervisor' ||
      currentProfile.is_active !== true
    ) {
      return NextResponse.json(
        { error: '只有啟用中的主管帳號可以新增使用者。' },
        { status: 403 }
      )
    }

    const body = await request.json()

    const username = String(body?.username || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')

    const password = String(body?.password || '')

    const role: AppRole =
      body?.role === 'supervisor'
        ? 'supervisor'
        : 'manager'

    const parkingLotIds: string[] =
      Array.isArray(body?.parkingLotIds)
        ? Array.from(
            new Set(
              body.parkingLotIds
                .map((id: unknown) => String(id).trim())
                .filter(Boolean)
            )
          )
        : []

    if (!username) {
      return NextResponse.json(
        { error: '請輸入帳號。' },
        { status: 400 }
      )
    }

    if (!/^[a-z0-9._-]+$/i.test(username)) {
      return NextResponse.json(
        { error: '帳號只能使用英文字母、數字、句點、底線或連字號。' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: '密碼至少需要 8 碼。' },
        { status: 400 }
      )
    }

    if (role === 'manager' && parkingLotIds.length === 0) {
      return NextResponse.json(
        { error: '場站管理員至少需要分配 1 個停車場。' },
        { status: 400 }
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
            '正式環境缺少 Supabase 管理金鑰設定，請檢查 Vercel Environment Variables。',
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

    const email = `${username}@parking.local`

    const {
      data: createData,
      error: createError,
    } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: username,
      },
    })

    if (createError) {
      return NextResponse.json(
        { error: '建立登入帳號失敗：' + createError.message },
        { status: 500 }
      )
    }

    const newUser = createData.user

    if (!newUser) {
      return NextResponse.json(
        { error: 'Supabase 沒有回傳新使用者資料。' },
        { status: 500 }
      )
    }

    const { error: profileError } = await admin
      .from('profiles')
      .upsert(
        {
          id: newUser.id,
          display_name: username,
          role,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'id',
        }
      )

    if (profileError) {
      await admin.auth.admin.deleteUser(newUser.id)

      return NextResponse.json(
        { error: '建立帳號資料失敗：' + profileError.message },
        { status: 500 }
      )
    }

    if (role === 'manager') {
      const rows = parkingLotIds.map((parkingLotId) => ({
        user_id: newUser.id,
        parking_lot_id: parkingLotId,
      }))

      const { error: assignmentError } = await admin
        .from('user_parking_lots')
        .insert(rows)

      if (assignmentError) {
        await admin.auth.admin.deleteUser(newUser.id)

        return NextResponse.json(
          { error: '停車場權限建立失敗：' + assignmentError.message },
          { status: 500 }
        )
      }
    }

    await admin.from('system_logs').insert({
      user_id: currentUser.id,
      action: 'CREATE_USER',
      entity_type: 'profile',
      entity_id: newUser.id,
      detail: {
        username,
        role,
        parking_lot_ids:
          role === 'manager'
            ? parkingLotIds
            : [],
      },
    })

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: newUser.id,
          username,
          role,
        },
      },
      { status: 201 }
    )
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          '建立帳號時發生錯誤：' +
          (error?.message || '未知錯誤'),
      },
      { status: 500 }
    )
  }
}
