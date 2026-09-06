'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

export default function AccountantReportOnlyGuard({
  enabled,
  children,
}: {
  enabled: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const allowed =
    !enabled ||
    pathname === '/dashboard/reports' ||
    pathname.startsWith('/dashboard/reports/')

  useEffect(() => {
    if (!allowed) {
      router.replace('/dashboard/reports')
    }
  }, [allowed, router])

  if (!allowed) {
    return (
      <div className="card">
        正在返回報表中心…
      </div>
    )
  }

  return <>{children}</>
}
