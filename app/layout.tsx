import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '智驛停車營運雲端平台',
  description: '多停車場營運管理平台 V1'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-Hant"><body>{children}</body></html>
}
