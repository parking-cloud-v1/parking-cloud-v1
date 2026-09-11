import { createClient } from '@/lib/supabase/server'

export async function currentGoogleDriveSupervisor() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, allowed: false }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,is_active')
    .eq('id', user.id)
    .maybeSingle()

  return {
    user,
    allowed: Boolean(profile?.is_active && profile.role === 'supervisor'),
  }
}
