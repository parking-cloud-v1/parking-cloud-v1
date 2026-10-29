'use client'

import { createContext, useContext } from 'react'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { featureForPage } from '@/lib/permissions/policy'
import type { Access, Feature } from '@/lib/permissions/policy'

const PermissionsContext = createContext<Partial<Record<Feature, Access>> | null>(null)

export function FeaturePermissionsProvider({ levels, children }: { levels: Record<Feature, Access>; children: ReactNode }) {
  return <PermissionsContext.Provider value={levels}>{children}</PermissionsContext.Provider>
}

export function useFeatureAccess(feature: Feature): Access {
  return useContext(PermissionsContext)?.[feature] ?? 'manage'
}

export function FeatureReadOnlyNotice() {
  const pathname = usePathname()
  const feature = featureForPage(pathname)
  const levels = useContext(PermissionsContext)
  if (!feature || feature === 'owner' || levels?.[feature] !== 'view') return null
  return <p role="status" style={{ padding: '12px 16px', margin: '0 0 18px', border: '1px solid #cbd5e1', borderRadius: 10, background: '#f8fafc', color: '#475569' }}>目前為僅查看權限，可查詢、預覽及下載資料；無法新增、修改、刪除或發送通知。</p>
}

/** Wrap controls that perform writes, while keeping filters and downloads outside. */
export function FeatureManageOnly({ feature, children }: { feature: Feature; children: ReactNode }) {
  return useFeatureAccess(feature) === 'manage' ? children : null
}
