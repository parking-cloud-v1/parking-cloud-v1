import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// 休假通知已改為新增／修改時直接同步 Google Calendar。
// 保留舊路由避免既有 Vercel Cron 因找不到網址而報錯，但不再發送 LINE。
export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: 'google_calendar',
    message: 'staff leave LINE reminder disabled',
  })
}
