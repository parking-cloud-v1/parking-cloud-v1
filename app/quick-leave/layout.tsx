import type {Metadata} from 'next'
export const metadata: Metadata = {
 title:'員工快速排休',
 description:'停車場主管與授權管理員快速設定員工休假',
 manifest:'/quick-leave/manifest.webmanifest',
 appleWebApp:{capable:true,title:'快速排休',statusBarStyle:'default'},
 icons:{icon:'/quick-leave/icon-192.png',apple:'/quick-leave/icon-180.png'}
}
export default function QuickLeaveLayout({children}:{children:React.ReactNode}){return children}
