import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DataMaintenanceClient from '@/components/DataMaintenanceClient'
export default async function DataMaintenancePage(){const s=await createClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect('/login');const {data:p}=await s.from('profiles').select('role,is_active').eq('id',user.id).maybeSingle();if(!p?.is_active||p.role!=='supervisor')redirect('/dashboard');const {data:lots}=await s.from('parking_lots').select('id,name').order('name');return <DataMaintenanceClient parkingLots={(lots||[]) as any}/>} 
