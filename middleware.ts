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

function isPublicPath(path: string) {
  return (
    path === '/login' ||
    path.startsWith('/login/') ||
    path === '/apply' ||
    path.startsWith('/apply/') ||
    path === '/renew' ||
    path.startsWith('/renew/') ||
    path === '/status' ||
    path.startsWith('/status/') ||
    path === '/sign' ||
    path.startsWith('/sign/') ||
    path === '/supplement' ||
    path.startsWith('/supplement/') ||
    path === '/waitlist-offer' ||
    path.startsWith('/waitlist-offer/') ||
    path.startsWith('/api/public/') ||
    path === '/robots.txt'
  )
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

  const publicPath =
    isPublicPath(path)

  if (
    !user &&
    !publicPath
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
    (
      path === '/login' ||
      path.startsWith('/login/')
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
