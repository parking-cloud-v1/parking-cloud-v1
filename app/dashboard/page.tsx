import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ui from '@/components/PlatformAdmin.module.css'

export default async function DashboardPage(){
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role,is_active').eq('id', user.id).maybeSingle()
  if (!profile?.is_active) redirect('/login')

  const cards = [
    ['/dashboard/online','線','線上作業中心','申請、補件、候補、契約、提醒與報表集中處理。'],
    ['/dashboard/monthly-rentals','月','月租管理','管理目前工作停車場的月租戶、繳費、續租與退租。'],
    ['/dashboard/monthly-rentals/waiting-list','候','月租候補名單','查看候補順序、聯絡狀態及轉正式月租。'],
    ['/dashboard/shift-closing','結','當日結班報表','完成每日班別收入與匯款相關紀錄。'],
    ['/dashboard/disaster-inspections','防','防災檢查','颱風、豪雨等防災自主檢查與紀錄。'],
    ['/dashboard/attendance-upload','簽','簽到表上傳','依月份上傳現場簽到表，供報表中心統一下載。'],
    ['/dashboard/dengue-photos','登','登革熱照片上傳','上傳登革熱防治作業照片，供公司彙整下載。'],
    ...(profile.role === 'supervisor' ? [['/dashboard/reports','報','報表中心','跨場下載防災、計程車、簽到表、月租、契約與登革熱照片。']] : []),
    ['/dashboard/parking-lots','場','停車場管理','維護停車場基本資料、容量與管理設定。'],
  ] as const

  return <div className={ui.homePage}>
    <section className={ui.hero}><div className={ui.eyebrow}>智驛科技有限公司</div><h1 className={ui.heroTitle}>停車場營運管理平台</h1><p className={ui.heroText}>先從左側選擇目前工作停車場，再進入月租、線上申請、候補、結班與現場作業。主管可使用報表中心跨場下載公司需要的資料。</p></section>
    <h2 className={ui.sectionHeading}>常用作業</h2>
    <div className={ui.quickGrid}>{cards.map(([href,icon,title,desc])=><Link href={href} key={href} className={ui.quickCard}><div className={ui.quickIcon}>{icon}</div><div className={ui.quickTitle}>{title}</div><div className={ui.quickDesc}>{desc}</div></Link>)}</div>
  </div>
}
