import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const MANUAL_MODE_MESSAGE =
  'Google Drive 已切換為手動歸檔模式。請先從報表中心下載檔案，再使用畫面上的 Google Drive 連結手動上傳。'

export async function GET() {
  return NextResponse.json({
    manualMode: true,
    automaticUploadEnabled: false,
    message: MANUAL_MODE_MESSAGE,
  })
}

export async function POST() {
  return NextResponse.json(
    { error: MANUAL_MODE_MESSAGE, manualMode: true },
    { status: 410 }
  )
}

export async function PUT() {
  return NextResponse.json(
    { error: MANUAL_MODE_MESSAGE, manualMode: true },
    { status: 410 }
  )
}
