'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function MonthlyRentalDeleteButton({
  rental,
}: {
  rental: {
    id: string
    customer_name?: string | null
    customer_code?: string | null
    vehicle_plate?: string | null
  }
}) {
  const router = useRouter()
  const supabase = createClient()
  const [deleting, setDeleting] = useState(false)

  async function hardDelete() {
    const label = [
      rental.customer_code,
      rental.customer_name,
      rental.vehicle_plate,
    ].filter(Boolean).join(' / ')

    const first = window.confirm(
      `確定要永久刪除這筆月租資料？\n\n${label || rental.id}\n\n此功能只供「測試資料、重複資料、輸入錯誤」使用。\n不會轉成退租，也不會進退租歷史。`
    )
    if (!first) return

    const second = window.confirm(
      '再次確認：刪除後無法復原。正式退租請不要使用這個按鈕，請走原本的「退租」功能。'
    )
    if (!second) return

    setDeleting(true)
    try {
      const { error } = await supabase.rpc(
        'hard_delete_monthly_rental_error',
        { p_rental_id: rental.id }
      )
      if (error) throw error
      router.refresh()
    } catch (error: any) {
      window.alert(
        '刪除失敗：' +
          (error?.message || '未知錯誤')
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={hardDelete}
      disabled={deleting}
      title="僅供測試、重複或輸入錯誤資料永久刪除；正式退租請使用原退租功能"
      style={{
        marginTop: 6,
        padding: '6px 9px',
        borderRadius: 7,
        border: '1px solid #fecaca',
        background: '#fff',
        color: '#b91c1c',
        fontSize: 12,
        fontWeight: 800,
        cursor: deleting ? 'not-allowed' : 'pointer',
        opacity: deleting ? 0.55 : 1,
      }}
    >
      {deleting ? '刪除中…' : '刪除錯誤資料'}
    </button>
  )
}
