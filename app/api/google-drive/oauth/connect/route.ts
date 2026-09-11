import { NextRequest, NextResponse } from 'next/server'

import { currentGoogleDriveSupervisor } from '@/lib/google-drive-oauth-auth'
import {
  buildGoogleDriveAuthorizationUrl,
  configuredGoogleDriveOAuth,
  googleDriveOAuthCookieNames,
  googleDriveOAuthCookieOptions,
  newGoogleDriveOAuthState,
} from '@/lib/google-drive-oauth'

export const dynamic = 'force-dynamic'

function safeReturnTo(value: string) {
  const input = String(value || '').trim()
  if (!input.startsWith('/') || input.startsWith('//')) return '/dashboard'
  return input.slice(0, 1500)
}

export async function GET(request: NextRequest) {
  const auth = await currentGoogleDriveSupervisor()
  if (!auth.allowed) {
    return NextResponse.json(
      { error: '只有主管可以連結 Google Drive。' },
      { status: 403 }
    )
  }

  if (!configuredGoogleDriveOAuth()) {
    return NextResponse.json(
      {
        error:
          'Vercel 尚未設定 GOOGLE_DRIVE_OAUTH_CLIENT_ID / GOOGLE_DRIVE_OAUTH_CLIENT_SECRET / GOOGLE_DRIVE_OAUTH_REDIRECT_URI。',
      },
      { status: 400 }
    )
  }

  const state = newGoogleDriveOAuthState()
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get('returnTo') || '')
  const authorizationUrl = buildGoogleDriveAuthorizationUrl(state)
  const response = NextResponse.redirect(authorizationUrl)
  const options = googleDriveOAuthCookieOptions()

  response.cookies.set(googleDriveOAuthCookieNames.state, state, {
    ...options,
    maxAge: 10 * 60,
  })
  response.cookies.set(googleDriveOAuthCookieNames.returnTo, returnTo, {
    ...options,
    maxAge: 10 * 60,
  })

  return response
}
