'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Row = {
  id: string
  case_type: string
  reserved_type: string | null
  vehicle_plate: string | null
  location_text: string | null
  start_date: string
  notes: string | null
  supervisor_status: string
  created_at: string
  parking_lots?: { name?: string } | { name?: string }[] | null
}

function lotName(row: Row) {
  const value = row.parking_lots
  if (Array.isArray(value)) return value[0]?.name || '-'
  return value?.name || '-'
}

function typeText(row: Row) {
  if (row.case_type === 'reserved_violation') {
    return row.reserved_type === 'disabled' ? '身障車格違規' : '婦幼車格違規'
  }
  if (row.case_type === 'long_stay') return '場內久停車'
  return '無牌車輛'
}

function statusText(value: string) {
  if (value === 'pending') return '待主管查看'
  if (value === 'seen') return '主管已查看'
  if (value === 'reported') return '已舉發'
  if (value === 'closed') return '已結案'
  return value || '-'
}

export default function ViolationSupervisorAlerts() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState('')

  async function load() {
    const { data, error } = await supabase
      .from('violation_parking_cases')
      .select(`
        id,
        case_type,
        reserved_type,
        vehicle_plate,
        location_text,
        start_date,
        notes,
        supervisor_status,
        created_at,
        parking_lots (name)
      `)
      .in('supervisor_status', ['pending','seen','reported'])
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      setMessage(`違規通知讀取失敗：${error.message}`)
      return
    }

    setRows((data || []) as Row[])
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 10000)
    return () => window.clearInterval(timer)
  }, [])

  async function changeStatus(id: string, status: 'seen'|'reported'|'closed') {
    setWorking(id)
    setMessage('')

    try {
      const response = await fetch(`/api/violation-parking/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || '處理失敗')

      setMessage(
        status === 'reported'
          ? '已標記為「已舉發」。'
          : status === 'closed'
            ? '案件已結案。'
            : '已標記主管查看。'
      )

      await load()
    } catch (error: any) {
      setMessage(error?.message || '處理失敗')
    } finally {
      setWorking('')
    }
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <h1 style={{ marginBottom: 6 }}>違規即時通知</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        場站建立違規案件後會立即列在這裡；本頁每 10 秒自動更新，主管可直接標記已查看、已舉發或結案。
      </p>

      {message && (
        <div className="card" style={{ marginTop: 14, whiteSpace: 'pre-wrap' }}>
          {message}
        </div>
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>
          待處理案件：{rows.filter((row) => row.supervisor_status !== 'reported').length} 件
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>時間</th>
                <th>停車場</th>
                <th>類型</th>
                <th>車牌</th>
                <th>位置</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.created_at).toLocaleString('zh-TW')}</td>
                  <td>{lotName(row)}</td>
                  <td>{typeText(row)}</td>
                  <td>{row.vehicle_plate || '無牌'}</td>
                  <td>{row.location_text || '-'}</td>
                  <td><strong>{statusText(row.supervisor_status)}</strong></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {row.supervisor_status === 'pending' && (
                        <button
                          type="button"
                          disabled={working === row.id}
                          onClick={() => changeStatus(row.id, 'seen')}
                        >
                          已查看
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn"
                        disabled={working === row.id}
                        onClick={() => changeStatus(row.id, 'reported')}
                      >
                        已舉發
                      </button>
                      <button
                        type="button"
                        disabled={working === row.id}
                        onClick={() => changeStatus(row.id, 'closed')}
                      >
                        結案
                      </button>
                      <a
                        href="/dashboard/violation-parking"
                        style={{ alignSelf: 'center', fontWeight: 700 }}
                      >
                        開啟照片
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 26 }}>
                    目前沒有待處理違規案件
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
