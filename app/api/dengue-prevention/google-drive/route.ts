import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const MANUAL_MODE_MESSAGE =
  '登革熱 Google Drive 已切換為手動模式。請下載當日 ZIP，再開啟畫面中指定的 Google Drive 資料夾手動上傳。'

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
