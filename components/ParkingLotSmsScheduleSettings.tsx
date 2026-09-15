'use client'

// PHASE47_PER_LOT_SMS_SCHEDULE_SETTINGS
import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  createClient,
} from '@/lib/supabase/client'

type ParkingLot = {
  id: string
  name: string
}

type LotSetting = {
  parking_lot_id: string
  schedule_start_month: string
}

function monthInputValue(
  value?: string | null
) {
  if (!value) return ''
  return String(value).slice(0, 7)
}

export default function ParkingLotSmsScheduleSettings({
  parkingLots,
}: {
  parkingLots: ParkingLot[]
}) {
  const supabase =
    useMemo(
      () => createClient(),
      []
    )

  const [
    selectedLotId,
    setSelectedLotId,
  ] =
    useState('')

  const [
    scheduleStartMonth,
    setScheduleStartMonth,
  ] =
    useState('')

  const [
    loading,
    setLoading,
  ] =
    useState(false)

  const [
    saving,
    setSaving,
  ] =
    useState(false)

  const [
    message,
    setMessage,
  ] =
    useState('')

  const currentLot =
    useMemo(
      () =>
        parkingLots.find(
          (lot) =>
            lot.id ===
            selectedLotId
        ),
      [
        parkingLots,
        selectedLotId,
      ]
    )

  useEffect(() => {
    if (
      typeof window ===
      'undefined' ||
      parkingLots.length ===
      0
    ) {
      return
    }

    const saved =
      window.localStorage.getItem(
        'current-work-parking-lot-id'
      )

    const initial =
      saved &&
      parkingLots.some(
        (lot) =>
          lot.id === saved
      )
        ? saved
        : parkingLots[0].id

    setSelectedLotId(
      initial
    )
  }, [
    parkingLots,
  ])

  useEffect(() => {
    if (!selectedLotId) {
      setScheduleStartMonth('')
      return
    }

    void loadSetting(
      selectedLotId
    )
  }, [
    selectedLotId,
  ])

  async function loadSetting(
    parkingLotId: string
  ) {
    setLoading(true)
    setMessage('')

    try {
      const {
        data,
        error,
      } =
        await supabase
          .from(
            'monthly_sms_lot_settings'
          )
          .select(
            'parking_lot_id,schedule_start_month'
          )
          .eq(
            'parking_lot_id',
            parkingLotId
          )
          .maybeSingle()

      if (error) {
        throw error
      }

      const setting =
        data as
          | LotSetting
          | null

      setScheduleStartMonth(
        monthInputValue(
          setting?.schedule_start_month
        )
      )

      if (!setting) {
        setMessage(
          '這個停車場尚未設定簡訊週期起始月份。請先設定後再整理簡訊排程。'
        )
      }
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '簡訊排程設定讀取失敗'
      )
    } finally {
      setLoading(false)
    }
  }

  async function saveSetting() {
    if (!selectedLotId) {
      setMessage(
        '請先選擇停車場'
      )
      return
    }

    if (!scheduleStartMonth) {
      setMessage(
        '請設定簡訊週期起始月份'
      )
      return
    }

    setSaving(true)
    setMessage('')

    try {
      const {
        error,
      } =
        await supabase
          .from(
            'monthly_sms_lot_settings'
          )
          .upsert(
            {
              parking_lot_id:
                selectedLotId,

              schedule_start_month:
                `${scheduleStartMonth}-01`,
            },
            {
              onConflict:
                'parking_lot_id',
            }
          )

      if (error) {
        throw error
      }

      setMessage(
        `已儲存「${currentLot?.name || '目前停車場'}」的簡訊週期起始月份。`
      )
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '儲存失敗'
      )
    } finally {
      setSaving(false)
    }
  }

  async function refreshThisLot() {
    if (!selectedLotId) {
      setMessage(
        '請先選擇停車場'
      )
      return
    }

    if (!scheduleStartMonth) {
      setMessage(
        '請先設定並儲存簡訊週期起始月份'
      )
      return
    }

    const ok =
      window.confirm(
        `只重新整理「${currentLot?.name || '目前停車場'}」的簡訊排程。\n\n` +
          `其他停車場完全不會變動。\n` +
          `固定租期也不會修改。\n\n` +
          `確定繼續嗎？`
      )

    if (!ok) {
      return
    }

    setSaving(true)
    setMessage('')

    try {
      const {
        data,
        error,
      } =
        await supabase
          .rpc(
            'refresh_monthly_sms_schedule_for_lot',
            {
              p_parking_lot_id:
                selectedLotId,
            }
          )

      if (error) {
        throw error
      }

      setMessage(
        `已重新整理「${currentLot?.name || '目前停車場'}」簡訊排程，共處理 ${Number(data || 0)} 筆。其他停車場未變動。`
      )
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          '重新整理失敗'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="card"
      style={{
        marginTop: 20,
        padding: 18,
        border:
          '1px solid #cbd5e1',
        background:
          '#f8fafc',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent:
            'space-between',
          gap: 16,
          alignItems:
            'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2
            style={{
              marginTop: 0,
              marginBottom: 6,
            }}
          >
            各停車場簡訊週期
          </h2>

          <div
            className="muted"
          >
            每個停車場各自設定，不共用月份。固定租期不變；這裡只控制簡訊排程的起始月份。
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(260px,1fr) 220px',
          gap: 14,
          marginTop: 18,
          alignItems: 'end',
        }}
      >
        <div
          className="field"
        >
          <label>
            要設定的停車場
          </label>

          <select
            value={
              selectedLotId
            }
            onChange={(
              event
            ) =>
              setSelectedLotId(
                event.target.value
              )
            }
          >
            <option value="">
              請選擇停車場
            </option>

            {parkingLots.map(
              (lot) => (
                <option
                  key={
                    lot.id
                  }
                  value={
                    lot.id
                  }
                >
                  {lot.name}
                </option>
              )
            )}
          </select>
        </div>

        <div
          className="field"
        >
          <label>
            簡訊週期起始月份
          </label>

          <input
            type="month"
            value={
              scheduleStartMonth
            }
            onChange={(
              event
            ) =>
              setScheduleStartMonth(
                event.target.value
              )
            }
          />
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 14,
          borderRadius: 10,
          background: '#fff',
          border:
            '1px solid #e2e8f0',
          fontSize: 15,
          lineHeight: 1.7,
        }}
      >
        <strong>
          排程範例：
        </strong>{' '}
        若起始月份為 2026/03，
        1 個月週期會出現在
        03、04、05、06…；
        2 個月週期會出現在
        03、05、07、09…。
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          marginTop: 16,
        }}
      >
        <button
          type="button"
          className="btn"
          disabled={
            loading ||
            saving ||
            !selectedLotId
          }
          onClick={() =>
            void saveSetting()
          }
        >
          儲存此停車場設定
        </button>

        <button
          type="button"
          disabled={
            loading ||
            saving ||
            !selectedLotId ||
            !scheduleStartMonth
          }
          onClick={() =>
            void refreshThisLot()
          }
          style={{
            padding:
              '9px 14px',
            borderRadius: 8,
            border:
              '1px solid #0f172a',
            background:
              '#fff',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          重新整理此停車場簡訊排程
        </button>
      </div>

      {message && (
        <div
          style={{
            marginTop: 14,
            fontWeight: 600,
          }}
        >
          {message}
        </div>
      )}
    </div>
  )
}
