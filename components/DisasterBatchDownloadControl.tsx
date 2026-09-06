'use client'

import { useMemo, useState } from 'react'

type DateCount = {
  date: string
  count: number
}

export default function DisasterBatchDownloadControl({
  dateCounts,
}: {
  dateCounts: DateCount[]
}) {
  const latestDate =
    dateCounts[0]?.date ||
    new Date().toISOString().slice(0, 10)

  const [selectedDate, setSelectedDate] =
    useState(latestDate)

  const countMap = useMemo(
    () =>
      new Map(
        dateCounts.map((item) => [
          item.date,
          item.count,
        ])
      ),
    [dateCounts]
  )

  const selectedCount =
    countMap.get(selectedDate) || 0

  function downloadAll() {
    if (!selectedDate) {
      window.alert('請先選擇檢查日期')
      return
    }

    if (selectedCount <= 0) {
      window.alert(
        '這個日期目前沒有防災檢查資料。'
      )
      return
    }

    window.location.href =
      `/dashboard/disaster-inspections/batch?date=${encodeURIComponent(
        selectedDate
      )}&download=1`
  }

  return (
    <div
      className="card"
      style={{
        marginTop: 18,
        padding: 16,
        border: '1px solid #bfdbfe',
        background: '#eff6ff',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              color: '#1e3a8a',
              fontWeight: 900,
              fontSize: 16,
            }}
          >
            主管｜依日期一次下載當日全部防災檢查
          </div>
          <div
            style={{
              marginTop: 5,
              color: '#475569',
              fontSize: 13,
            }}
          >
            系統會把該日期所有停車場檢查表合併成一個 PDF，不必逐筆下載。
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <div className="field">
            <label>檢查日期</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) =>
                setSelectedDate(
                  event.target.value
                )
              }
            />
          </div>

          <div
            style={{
              minWidth: 88,
              paddingBottom: 9,
              color:
                selectedCount > 0
                  ? '#166534'
                  : '#64748b',
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            當日 {selectedCount} 份
          </div>

          <button
            type="button"
            className="btn"
            onClick={downloadAll}
            disabled={
              !selectedDate ||
              selectedCount <= 0
            }
            style={{
              marginBottom: 0,
              whiteSpace: 'nowrap',
            }}
          >
            下載當日全部 PDF
          </button>
        </div>
      </div>
    </div>
  )
}
