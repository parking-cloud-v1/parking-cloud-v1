import {
  createServerClient,
} from '@supabase/ssr'

import {
  cookies,
} from 'next/headers'

type CookieToSet = {
  name: string
  value: string
  options?: any
}

export async function createClient() {
  const cookieStore =
    await cookies()

  const url =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL

  const key =
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      '缺少 Supabase 環境變數'
    )
  }

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },

        setAll(
          cookiesToSet:
            CookieToSet[]
        ) {
          try {
            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                cookieStore.set(
                  name,
                  value,
                  options
                )
              }
            )
          } catch {
            // Server Component
            // 中若無法寫入 cookie，
            // 交由 middleware 處理。
          }
        },
      },
    }
  )
}