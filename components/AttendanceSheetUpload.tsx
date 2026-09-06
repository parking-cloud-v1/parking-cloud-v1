'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

function monthStart(month: string) {
  return `${month}-01`
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function safeName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
}

type ExistingRow = {
  id: string
  storage_path: string
  file_name: string
  uploaded_at: string
  uploaded_by: string | null
}

export default function AttendanceSheetUpload({
  parkingLotId,
  parkingLotName,
}: {
  parkingLotId: string
  parkingLotName: string
}) {
  const supabase = createClient()

  const [month, setMonth] = useState(currentMonth())
  const [files, setFiles] = useState<File[]>([])
  const [existingRows, setExistingRows] = useState<ExistingRow[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadExisting()
  }, [parkingLotId, month])

  async function loadExisting() {
    if (!parkingLotId || !month) {
      setExistingRows([])
      return
    }

    const { data, error } = await supabase
      .from('monthly_attendance_sheets')
      .select('id,storage_path,file_name,uploaded_at,uploaded_by')
      .eq('parking_lot_id', parkingLotId)
      .eq('attendance_month', monthStart(month))
      .order('uploaded_at', { ascending: false })

    if (error) {
      setMessage('簽到表讀取失敗：' + error.message)
      return
    }

    setExistingRows((data || []) as ExistingRow[])
  }

  async function upload() {
    if (!files.length) {
      setMessage('請先選擇簽到表檔案。')
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('登入狀態失效。')
      return
    }

    setLoading(true)
    setMessage('')

    const uploadedPaths: string[] = []

    try {
      const now = Date.now()
      const rows: Record<string, unknown>[] = []

      for (let index = 0; index < files.length; index++) {
        const file = files[index]

        const path =
          `${parkingLotId}/${month}/${now}_${index}_${safeName(file.name)}`

        const { error: uploadError } = await supabase.storage
          .from('monthly-attendance')
          .upload(path, file, {
            upsert: false,
          })

        if (uploadError) {
          throw uploadError
        }

        uploadedPaths.push(path)

        rows.push({
          parking_lot_id: parkingLotId,
          attendance_month: monthStart(month),
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          file_size: file.size,
          uploaded_by: user.id,
          uploaded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }

      /*
       * 重要：
       * 使用 insert，不再使用 upsert。
       * 同一停車場 + 同一月份可以有多位人員、多份簽到表。
       */
      const { error: rowError } = await supabase
        .from('monthly_attendance_sheets')
        .insert(rows)

      if (rowError) {
        if (uploadedPaths.length) {
          await supabase.storage
            .from('monthly-attendance')
            .remove(uploadedPaths)
        }

        throw rowError
      }

      setFiles([])

      const input =
        document.getElementById('attendance-file') as HTMLInputElement | null

      if (input) {
        input.value = ''
      }

      setMessage(
        `${month} 已新增 ${rows.length} 份簽到表；原有檔案全部保留。`
      )

      await loadExisting()
    } catch (error: any) {
      setMessage(
        '上傳失敗：' +
          (error?.message || '未知錯誤')
      )
    } finally {
      setLoading(false)
    }
  }

  async function downloadExisting(row: ExistingRow) {
    const { data, error } = await supabase.storage
      .from('monthly-attendance')
      .download(row.storage_path)

    if (error || !data) {
      setMessage(
        '下載失敗：' +
          (error?.message || '未知錯誤')
      )
      return
    }

    const url = URL.createObjectURL(data)
    const a = document.createElement('a')

    a.href = url
    a.download = row.file_name
    a.click()

    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="card" style={{ padding: 20 }}>
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: '#eff6ff',
            marginBottom: 18,
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: '#1d4ed8',
              fontWeight: 800,
            }}
          >
            目前工作停車場
          </div>

          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              marginTop: 4,
            }}
          >
            {parkingLotName}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(180px,.6fr) minmax(280px,1.4fr)',
            gap: 14,
          }}
        >
          <div className="field">
            <label>簽到表月份</label>
            <input
              type="month"
              value={month}
              onChange={(event) =>
                setMonth(event.target.value)
              }
            />
          </div>

          <div className="field">
            <label>選擇檔案（可一次多選）</label>
            <input
              id="attendance-file"
              type="file"
              multiple
              accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png"
              onChange={(event) =>
                setFiles(
                  Array.from(
                    event.target.files || []
                  )
                )
              }
            />
          </div>
        </div>

        {files.length > 0 && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 10,
              background: '#f8fafc',
              color: '#475569',
              fontSize: 13,
            }}
          >
            本次準備上傳：
            <strong style={{ marginLeft: 5 }}>
              {files.length} 份
            </strong>
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            color: '#64748b',
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          同一停車場、同一月份可由多人上傳多份簽到表。
          <strong style={{ color: '#0f172a' }}>
            新上傳不會覆蓋舊檔。
          </strong>
        </div>

        {message && (
          <div
            style={{
              marginTop: 14,
              fontWeight: 700,
              color:
                message.includes('失敗')
                  ? '#b91c1c'
                  : '#166534',
            }}
          >
            {message}
          </div>
        )}

        <button
          type="button"
          className="btn"
          onClick={upload}
          disabled={
            loading ||
            files.length === 0
          }
          style={{ marginTop: 18 }}
        >
          {loading
            ? '上傳中…'
            : `新增 ${files.length || ''} 份簽到表`}
        </button>
      </div>

      <div
        className="card"
        style={{
          padding: 20,
          marginTop: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
              }}
            >
              {month} 已上傳簽到表
            </h2>

            <div
              style={{
                marginTop: 5,
                color: '#64748b',
                fontSize: 13,
              }}
            >
              共 {existingRows.length} 份
            </div>
          </div>
        </div>

        {!existingRows.length ? (
          <div
            style={{
              marginTop: 16,
              padding: 18,
              borderRadius: 10,
              background: '#f8fafc',
              color: '#64748b',
              textAlign: 'center',
            }}
          >
            本月份尚未上傳簽到表
          </div>
        ) : (
          <div
            style={{
              marginTop: 14,
              display: 'grid',
              gap: 10,
            }}
          >
            {existingRows.map(
              (row, index) => (
                <div
                  key={row.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    border:
                      '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        wordBreak: 'break-word',
                      }}
                    >
                      {index + 1}. {row.file_name}
                    </div>

                    <div
                      style={{
                        marginTop: 4,
                        color: '#64748b',
                        fontSize: 12,
                      }}
                    >
                      上傳時間：
                      {new Date(
                        row.uploaded_at
                      ).toLocaleString(
                        'zh-TW'
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      downloadExisting(
                        row
                      )
                    }
                  >
                    下載
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
