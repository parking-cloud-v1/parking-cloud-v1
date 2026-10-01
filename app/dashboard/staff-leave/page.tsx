import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import StaffLeaveClient from './staff-leave-client'

export default async function StaffLeavePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_active) redirect('/login')
  if (profile.role !== 'supervisor') redirect('/dashboard')

  return <StaffLeaveClient />
}
