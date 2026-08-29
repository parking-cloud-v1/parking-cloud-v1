import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: '尚未登入' },
        { status: 401 }
      )
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (
      !profile ||
      profile.role !== 'supervisor' ||
      !profile.is_active
    ) {
      return NextResponse.json(
        { error: '沒有主管權限' },
        { status: 403 }
      )
    }

    const body = await request.json()

    const username = String(body.username || '')
      .trim()
      .toLowerCase()

    const password = String(body.password || '')
    const role =
      body.role === 'supervisor'
        ? 'supervisor'
        : 'manager'

    const parkingLotIds = Array.isArray(body.parkingLotIds)
      ? body.parkingLotIds
      : []

    if (!username) {
      return NextResponse.json(
        { error: '請輸入帳號' },
        { status: 400 }
      )
    }

    if (!/^[a-z0-9._-]+$/.test(username)) {
      return NextResponse.json(
        {
          error:
            '帳號只能使用英文、數字、點、底線或減號',
        },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: '密碼至少需要 8 碼' },
        { status: 400 }
      )
    }

    const internalEmail = `${username}@parking.local`

    const admin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
)

    const {
      data: createdUser,
      error: createError,
    } = await admin.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: username,
      },
    })

    if (createError || !createdUser.user) {
      return NextResponse.json(
        {
          error:
            createError?.message ||
            '建立帳號失敗',
        },
        { status: 400 }
      )
    }

    const newUserId = createdUser.user.id

    const { error: profileError } = await admin
      .from('profiles')
      .update({
        display_name: username,
        role,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', newUserId)

    if (profileError) {
      await admin.auth.admin.deleteUser(newUserId)

      return NextResponse.json(
        {
          error:
            '帳號已建立，但 Profile 設定失敗：' +
            profileError.message,
        },
        { status: 500 }
      )
    }

    if (
      role === 'manager' &&
      parkingLotIds.length > 0
    ) {
      const rows = parkingLotIds.map(
        (parkingLotId: string) => ({
          user_id: newUserId,
          parking_lot_id: parkingLotId,
        })
      )

      const { error: lotError } = await admin
        .from('user_parking_lots')
        .insert(rows)

      if (lotError) {
        return NextResponse.json(
          {
            error:
              '帳號建立成功，但停車場分配失敗：' +
              lotError.message,
          },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      username,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.message || '系統錯誤',
      },
      { status: 500 }
    )
  }
}