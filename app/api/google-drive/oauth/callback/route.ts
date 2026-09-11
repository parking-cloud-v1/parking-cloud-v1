import { NextRequest, NextResponse } from 'next/server'

import { currentGoogleDriveSupervisor } from '@/lib/google-drive-oauth-auth'
import {
  encryptGoogleDriveRefreshToken,
  exchangeGoogleDriveCode,
  googleDriveOAuthCookieNames,
  googleDriveOAuthCookieOptions,
} from '@/lib/google-drive-oauth'

export const dynamic = 'force-dynamic'

function safeReturnTo(value: string) {
  const input = String(value || '').trim()
  if (!input.startsWith('/') || input.startsWith('//')) return '/dashboard'
  return input.slice(0, 1500)
}

function redirectWithStatus(request: NextRequest, returnTo: string, value: string) {
  const url = new URL(safeReturnTo(returnTo), request.url)
  url.searchParams.set('drive', value)
  return url
}

export async function GET(request: NextRequest) {
  const returnTo = safeReturnTo(
    request.cookies.get(googleDriveOAuthCookieNames.returnTo)?.value || '/dashboard'
  )

  try {
    const auth = await currentGoogleDriveSupervisor()
    if (!auth.allowed) {
      return NextResponse.redirect(
        redirectWithStatus(request, returnTo, 'forbidden')
      )
    }

    const error = request.nextUrl.searchParams.get('error')
    if (error) {
      return NextResponse.redirect(
        redirectWithStatus(request, returnTo, 'cancelled')
      )
    }

    const state = request.nextUrl.searchParams.get('state') || ''
    const expectedState =
      request.cookies.get(googleDriveOAuthCookieNames.state)?.value || ''
    const code = request.nextUrl.searchParams.get('code') || ''

    if (!state || !expectedState || state !== expectedState || !code) {
      return NextResponse.redirect(
        redirectWithStatus(request, returnTo, 'invalid_state')
      )
    }

    const token = await exchangeGoogleDriveCode(code)
    if (!token.refreshToken) {
      return NextResponse.redirect(
        redirectWithStatus(request, returnTo, 'no_refresh_token')
      )
    }

    const response = NextResponse.redirect(
      redirectWithStatus(request, returnTo, 'connected')
    )
    const options = googleDriveOAuthCookieOptions()

    response.cookies.set(
      googleDriveOAuthCookieNames.refresh,
      encryptGoogleDriveRefreshToken(token.refreshToken),
      {
        ...options,
        maxAge: 180 * 24 * 60 * 60,
      }
    )
    response.cookies.set(googleDriveOAuthCookieNames.state, '', {
      ...options,
      maxAge: 0,
    })
    response.cookies.set(googleDriveOAuthCookieNames.returnTo, '', {
      ...options,
      maxAge: 0,
    })

    return response
  } catch {
    return NextResponse.redirect(
      redirectWithStatus(request, returnTo, 'error')
    )
  }
}
