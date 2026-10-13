import type { Metadata } from 'next'

// 僅套用到 /time-clock；不影響停車平台其他頁面。
export const metadata: Metadata = {
  title: '停車打卡系統',
  description: '停車場員工上下班打卡',
  applicationName: '停車打卡系統',
  manifest: '/time-clock/manifest-v2.webmanifest',
  icons: {
    icon: [
      { url: '/time-clock/icon-192-v2.png', type: 'image/png', sizes: '192x192' },
      { url: '/time-clock/icon-512-v2.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/time-clock/icon-192-v2.png',
  },
  appleWebApp: { capable: true, title: '停車打卡', statusBarStyle: 'default' },
}

export default function TimeClockLayout({ children }: { children: React.ReactNode }) {
  return children
}
