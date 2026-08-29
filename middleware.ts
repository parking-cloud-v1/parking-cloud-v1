import {
  createServerClient,
} from '@supabase/ssr'

import {
  NextResponse,
  type NextRequest,
} from 'next/server'

type CookieToSet = {
  name: string
  value: string
  options?: any
}

export async function middleware(
  request: NextRequest
) {
  let response =
    NextResponse.next({
      request,
    })

  const url =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL

  const key =
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return response
  }

  const supabase =
    createServerClient(
      url,
      key,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },

          setAll(
            cookiesToSet:
              CookieToSet[]
          ) {
            cookiesToSet.forEach(
              ({
                name,
                value,
              }) => {
                request.cookies.set(
                  name,
                  value
                )
              }
            )

            response =
              NextResponse.next({
                request,
              })

            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                response.cookies.set(
                  name,
                  value,
                  options
                )
              }
            )
          },
        },
      }
    )

  const {
    data: {
      user,
    },
  } =
    await supabase.auth.getUser()

  const path =
    request.nextUrl.pathname

  const isPublic =
    path.startsWith(
      '/login'
    )

  if (
    !user &&
    !isPublic
  ) {
    const loginUrl =
      request.nextUrl.clone()

    loginUrl.pathname =
      '/login'

    return NextResponse.redirect(
      loginUrl
    )
  }

  if (
    user &&
    path.startsWith(
      '/login'
    )
  ) {
    const dashboardUrl =
      request.nextUrl.clone()

    dashboardUrl.pathname =
      '/dashboard'

    return NextResponse.redirect(
      dashboardUrl
    )
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}