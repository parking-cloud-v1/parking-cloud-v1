import { NextResponse } from 'next/server'

import { currentGoogleDriveSupervisor } from '@/lib/google-drive-oauth-auth'
import {
  configuredGoogleDriveOAuth,
  hasGoogleDriveOAuthConnection,
} from '@/lib/google-drive-oauth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await currentGoogleDriveSupervisor()
  if (!auth.allowed) {
    return NextResponse.json(
      { error: '只有主管可以使用 Google Drive 直接上傳。' },
      { status: 403 }
    )
  }

  return NextResponse.json({
    configured: configuredGoogleDriveOAuth(),
    connected: await hasGoogleDriveOAuthConnection(),
    mode: 'oauth',
  })
}
