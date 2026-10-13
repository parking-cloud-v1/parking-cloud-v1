import type { Metadata } from 'next'

// 只套用在 /time-clock，不修改整站的圖示或登入行為。
export const metadata: Metadata = {
  title: '停車打卡系統',
  description: '停車場員工上下班打卡',
  applicationName: '停車打卡系統',
  manifest: '/time-clock/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/time-clock/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/time-clock/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/time-clock/icon-192.png',
  },
  appleWebApp: { capable: true, title: '停車打卡', statusBarStyle: 'default' },
}

export default function TimeClockLayout({ children }: { children: React.ReactNode }) {
  return children
}
