import { NextResponse } from 'next/server'

import { currentGoogleDriveSupervisor } from '@/lib/google-drive-oauth-auth'
import {
  googleDriveOAuthCookieNames,
  googleDriveOAuthCookieOptions,
} from '@/lib/google-drive-oauth'

export const dynamic = 'force-dynamic'

export async function POST() {
  const auth = await currentGoogleDriveSupervisor()
  if (!auth.allowed) {
    return NextResponse.json(
      { error: '只有主管可以解除 Google Drive 連結。' },
      { status: 403 }
    )
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(googleDriveOAuthCookieNames.refresh, '', {
    ...googleDriveOAuthCookieOptions(),
    maxAge: 0,
  })
  return response
}
