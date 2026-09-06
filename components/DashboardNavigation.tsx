'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import shell from '@/components/PlatformShell.module.css'

type NavItem = { href: string; label: string; icon: string; exact?: boolean }
type NavSection = { title: string; items: NavItem[] }

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export default function DashboardNavigation({ isSupervisor, isAccountant = false }: { isSupervisor: boolean; isAccountant?: boolean }) {
  const pathname = usePathname()

  if (isAccountant) {
    return (
      <nav aria-label="會計報表選單">
        <section className={shell.navSection}>
          <div className={shell.navSectionTitle}>會計專區</div>
          <div className={shell.navList}>
            <Link href="/dashboard/reports" className={`${shell.navLink} ${pathname.startsWith('/dashboard/reports') ? shell.navLinkActive : ''}`}>
              <span className={shell.navIcon}>報</span><span>報表中心</span>
            </Link>
          </div>
        </section>
      </nav>
    )
  }

  const sections: NavSection[] = [
    {
      title: '主選單',
      items: [{ href: '/dashboard', label: '營運首頁', icon: '首', exact: true }],
    },
    {
      title: '線上作業',
      items: [
        { href: '/dashboard/online', label: '線上作業中心', icon: '線', exact: true },
        { href: '/dashboard/online/applications', label: '申請審核', icon: '申' },
        { href: '/dashboard/online/contracts', label: '電子契約', icon: '契' },
        { href: '/dashboard/online/capacity', label: '月租名額', icon: '額' },
        { href: '/dashboard/online/renewal-reminders', label: '續租提醒', icon: '續' },
        { href: '/dashboard/online/reminders', label: '待辦提醒', icon: '待' },
        { href: '/dashboard/online/reports', label: '營運報表', icon: '報' },
      ],
    },
    {
      title: '現場作業',
      items: [
        { href: '/dashboard/monthly-rentals', label: '月租管理', icon: '月', exact: true },
        { href: '/dashboard/monthly-rentals/waiting-list', label: '月租候補名單', icon: '候' },
        { href: '/dashboard/monthly-rentals/sms-list', label: '每月簡訊名單', icon: '訊' },
        { href: '/dashboard/taxi-discounts', label: '計程車折扣', icon: '計' },
        { href: '/dashboard/disaster-inspections', label: '防災檢查', icon: '防' },
        { href: '/dashboard/attendance-upload', label: '簽到表上傳', icon: '簽' },
        { href: '/dashboard/dengue-photos', label: '登革熱照片上傳', icon: '登' },
        { href: '/dashboard/shift-closing', label: '當日結班報表', icon: '班' },
      ],
    },
    {
      title: '基本管理',
      items: [{ href: '/dashboard/parking-lots', label: '停車場管理', icon: '場' }],
    },
  ]

  if (isSupervisor) {
    sections.push({ title: '報表', items: [{ href: '/dashboard/reports', label: '報表中心', icon: '報' }] })
    sections.push({
      title: '系統管理',
      items: [
        { href: '/dashboard/settings', label: '系統設定', icon: '設' },
        { href: '/dashboard/online/audit', label: '操作紀錄', icon: '錄' },
        { href: '/dashboard/online/health', label: '上線安全檢查', icon: '安' },
      ],
    })
  }

  return (
    <nav aria-label="後台功能選單">
      {sections.map((section) => (
        <section className={shell.navSection} key={section.title}>
          <div className={shell.navSectionTitle}>{section.title}</div>
          <div className={shell.navList}>
            {section.items.map((item) => {
              const active = isActive(pathname, item)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${shell.navLink} ${active ? shell.navLinkActive : ''}`}
                >
                  <span className={shell.navIcon}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </nav>
  )
}
