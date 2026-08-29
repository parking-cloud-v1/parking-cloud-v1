'use client'

import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  async function logout() {
    const supabase = createClient()

    await supabase.auth.signOut()

    window.location.href = '/login'
  }

  return (
    <button
      onClick={logout}
      style={{
        marginLeft: 12,
        padding: '6px 12px',
        borderRadius: 8,
        border: '1px solid #ccc',
        background: '#fff',
        cursor: 'pointer',
      }}
    >
      登出
    </button>
  )
}