'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function storageWorkType(value: WorkType) {
  return value === '委外消毒' ? 'outsourced-disinfection' : 'self-check'
}

function safeExtension(file: File) {
  const name = file.name || ''
  const raw = name.includes('.') ? name.split('.').pop() || '' : ''
  const ext = raw.toLowerCase().replace(/[^a-z0-9]/g, '')

  if (ext) return ext.slice(0, 10)
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'application/pdf') return 'pdf'
  return 'jpg'
}

type WorkType = '自主檢查' | '委外消毒'
type FileKind = 'photo' | 'report'

type Row = {
  id: string
  work_date: string
  work_type: string
  file_kind?: FileKind | null
  storage_path: string
  file_name: string
  mime_type?: string | null
  file_size?: number | null
  note: string | null
  uploaded_at: string
}

type DailyFolder = {
  date: string
  rows: Row[]
  photoCount: number
  reportCount: number
  workTypes: string[]
}

type DriveArchive = {
  fileName: string
  archivedAt: string
  fileUrl: string
  folderUrl: string
}

type DriveStatus = {
  configured: boolean
  credentialsConfigured: boolean
  rootConfigured: boolean
  rootFolderUrl: string
  serviceAccountEmail: string
  archives: Record<string, DriveArchive>
  archiveWarning?: string
}

function kindText(value?: FileKind | null) {
  return value === 'report' ? '報表' : '照片'
}

function formatBytes(value?: number | null) {
  const bytes = Number(value || 0)
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function DenguePhotoUpload({
  parkingLotId,
  parkingLotName,
}: {
  parkingLotId: string
  parkingLotName: string
}) {
  const supabase = createClient()

  const [workDate, setWorkDate] = useState(today())
  const [workType, setWorkType] = useState<WorkType>('自主檢查')
  const [note, setNote] = useState('')

  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [reportFile, setReportFile] = useState<File | null>(null)

  const [rows, setRows] = useState<Row[]>([])
  const [savingPhotos, setSavingPhotos] = useState(false)
  const [savingReport, setSavingReport] = useState(false)
  const [downloadingDate, setDownloadingDate] = useState('')
  const [uploadingDriveDate, setUploadingDriveDate] = useState('')
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null)
  const [message, setMessage] = useState('')

  const dailyFolders = useMemo<DailyFolder[]>(() => {
    const grouped = new Map<string, Row[]>()

    for (const row of rows) {
      const list = grouped.get(row.work_date) || []
      list.push(row)
      grouped.set(row.work_date, list)
    }

    return Array.from(grouped.entries())
      .map(([date, groupRows]) => ({
        date,
        rows: groupRows,
        photoCount: groupRows.filter((row) => row.file_kind !== 'report').length,
        reportCount: groupRows.filter((row) => row.file_kind === 'report').length,
        workTypes: Array.from(new Set(groupRows.map((row) => row.work_type).filter(Boolean))),
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [rows])

  useEffect(() => {
    void loadRows()
    void loadDriveStatus()
  }, [parkingLotId])

  async function loadDriveStatus() {
    if (!parkingLotId) {
      setDriveStatus(null)
      return
    }

    try {
      const response = await fetch(
        `/api/dengue-prevention/google-drive?parkingLotId=${encodeURIComponent(
          parkingLotId
        )}`,
        { cache: 'no-store' }
      )
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || 'Google Drive 狀態讀取失敗')
      setDriveStatus(json as DriveStatus)
    } catch (error: any) {
      setDriveStatus(null)
      setMessage(error?.message || 'Google Drive 狀態讀取失敗')
    }
  }

  async function loadRows() {
    const start = new Date()
    start.setMonth(start.getMonth() - 6)

    const y = start.getFullYear()
    const m = String(start.getMonth() + 1).padStart(2, '0')
    const d = String(start.getDate()).padStart(2, '0')

    const { data, error } = await supabase
      .from('dengue_prevention_photos')
      .select(
        'id,work_date,work_type,file_kind,storage_path,file_name,mime_type,file_size,note,uploaded_at'
      )
      .eq('parking_lot_id', parkingLotId)
      .gte('work_date', `${y}-${m}-${d}`)
      .order('work_date', { ascending: false })
      .order('uploaded_at', { ascending: false })

    if (error) {
      setMessage('登革熱消毒資料讀取失敗：' + error.message)
      return
    }

    setRows((data || []) as Row[])
  }

  async function getUserId() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new Error('登入狀態失效')
    }

    return user.id
  }

  async function insertFile(
    file: File,
    fileKind: FileKind,
    userId: string,
    index = 0
  ) {
    // Storage 本身就依「停車場／作業類型／日期」分層；
    // 同一天再次上傳會持續放進同一個日期資料夾。
    const path = `${parkingLotId}/${storageWorkType(workType)}/${workDate}/${fileKind}/${Date.now()}_${index}.${safeExtension(
      file
    )}`

    const { error: uploadError } = await supabase.storage
      .from('dengue-prevention')
      .upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      })

    if (uploadError) {
      throw uploadError
    }

    const { error: rowError } = await supabase
      .from('dengue_prevention_photos')
      .insert({
        parking_lot_id: parkingLotId,
        work_date: workDate,
        work_type: workType,
        file_kind: fileKind,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        file_size: file.size,
        note: note.trim() || null,
        uploaded_by: userId,
      })

    if (rowError) {
      await supabase.storage.from('dengue-prevention').remove([path])
      throw rowError
    }
  }

  async function uploadPhotos() {
    if (!photoFiles.length) {
      setMessage('請先選擇至少 1 張照片。')
      return
    }

    setSavingPhotos(true)
    setMessage('')

    try {
      const userId = await getUserId()

      for (let i = 0; i < photoFiles.length; i++) {
        const file = photoFiles[i]

        if (!file.type.startsWith('image/')) {
          throw new Error(`${file.name} 不是圖片檔。`)
        }

        await insertFile(file, 'photo', userId, i)
      }

      const count = photoFiles.length
      setPhotoFiles([])
      const input = document.getElementById(
        'dengue-photo-files'
      ) as HTMLInputElement | null
      if (input) input.value = ''

      setMessage(
        `已上傳 ${count} 張「${workType}」照片，已自動歸入 ${workDate} 每日資料夾。`
      )
      await loadRows()
    } catch (error: any) {
      setMessage('照片上傳失敗：' + (error?.message || '未知錯誤'))
    } finally {
      setSavingPhotos(false)
    }
  }

  async function uploadReport() {
    if (workType !== '自主檢查') {
      setMessage('委外消毒不需要上傳報表。')
      return
    }

    if (!reportFile) {
      setMessage('請先選擇要上傳的報表。')
      return
    }

    if (reportFile.size > 20 * 1024 * 1024) {
      setMessage('單一報表請勿超過 20 MB。')
      return
    }

    setSavingReport(true)
    setMessage('')

    try {
      const userId = await getUserId()
      await insertFile(reportFile, 'report', userId)

      setReportFile(null)
      const input = document.getElementById(
        'dengue-report-file'
      ) as HTMLInputElement | null
      if (input) input.value = ''

      setMessage(`已上傳「${workType}」報表，已自動歸入 ${workDate} 每日資料夾。`)
      await loadRows()
    } catch (error: any) {
      setMessage('報表上傳失敗：' + (error?.message || '未知錯誤'))
    } finally {
      setSavingReport(false)
    }
  }

  async function downloadDay(date: string) {
    if (!parkingLotId || downloadingDate) return

    setDownloadingDate(date)
    setMessage('')

    try {
      const response = await fetch(
        `/api/dengue-prevention/daily-download?parkingLotId=${encodeURIComponent(
          parkingLotId
        )}&date=${encodeURIComponent(date)}`,
        { cache: 'no-store' }
      )

      if (!response.ok) {
        let errorText = '每日資料夾下載失敗。'
        try {
          const json = await response.json()
          errorText = json?.error || errorText
        } catch {
          // 非 JSON 錯誤就使用預設訊息。
        }
        throw new Error(errorText)
      }

      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') || ''
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
      const fallbackName = `${date}_${parkingLotName || '停車場'}_登革熱消毒.zip`
      const fileName = utf8Match?.[1]
        ? decodeURIComponent(utf8Match[1])
        : fallbackName

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1500)

      setMessage(`${date} 每日資料夾已開始下載。`)
    } catch (error: any) {
      setMessage(error?.message || '每日資料夾下載失敗。')
    } finally {
      setDownloadingDate('')
    }
  }

  async function uploadDayToDrive(date: string) {
    if (!parkingLotId || uploadingDriveDate) return

    if (
      !window.confirm(
        `確定將 ${parkingLotName}／${date} 的登革熱作業資料夾上傳到公司 Google Drive？\n\n會以整包 ZIP 上傳，不會逐張照片上傳。`
      )
    ) {
      return
    }

    setUploadingDriveDate(date)
    setMessage(`${date} 每日資料夾正在上傳 Google Drive…`)

    try {
      const response = await fetch('/api/dengue-prevention/google-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parkingLotId, date }),
      })

      const json = await response.json()
      if (!response.ok) {
        throw new Error(json?.error || 'Google Drive 上傳失敗')
      }

      setMessage(
        json?.skipped
          ? `${date} 目前內容已經存在 Google Drive，未重複上傳。`
          : `${date} 每日資料夾已上傳 Google Drive（共 ${json?.fileCount || 0} 個檔案）。`
      )
      await loadDriveStatus()
    } catch (error: any) {
      setMessage(error?.message || 'Google Drive 上傳失敗')
    } finally {
      setUploadingDriveDate('')
    }
  }

  async function remove(row: Row) {
    if (!window.confirm(`確定刪除「${row.file_name}」？`)) {
      return
    }

    const { error: storageError } = await supabase.storage
      .from('dengue-prevention')
      .remove([row.storage_path])

    if (storageError) {
      setMessage('檔案刪除失敗：' + storageError.message)
      return
    }

    const { error } = await supabase
      .from('dengue_prevention_photos')
      .delete()
      .eq('id', row.id)

    if (error) {
      setMessage('檔案紀錄刪除失敗：' + error.message)
      return
    }

    setMessage('檔案已刪除。')
    await loadRows()
  }

  return (
    <div style={{ maxWidth: 1080 }}>
      <div className="card" style={{ padding: 20 }}>
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: '#f0fdf4',
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 13, color: '#166534', fontWeight: 800 }}>
            目前工作停車場
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
            {parkingLotName}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
            gap: 14,
          }}
        >
          <div className="field">
            <label>作業日期</label>
            <input
              type="date"
              value={workDate}
              onChange={(event) => setWorkDate(event.target.value)}
            />
          </div>

          <div className="field">
            <label>作業類型</label>
            <select
              value={workType}
              onChange={(event) => setWorkType(event.target.value as WorkType)}
            >
              <option value="自主檢查">自主檢查</option>
              <option value="委外消毒">委外消毒</option>
            </select>
          </div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>備註（選填）</label>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="例如：9 月自主檢查／委外消毒完成"
          />
        </div>

        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            background: '#eff6ff',
            color: '#1e3a8a',
            fontWeight: 700,
          }}
        >
          上傳成功後會自動依「日期」整理成每日資料夾；同一天追加上傳也會併入同一日。
        </div>
      </div>

      <div
        className="card"
        style={{
          marginTop: 18,
          padding: 18,
          borderColor: driveStatus?.configured ? '#bbf7d0' : '#fecaca',
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
            <h2 style={{ margin: 0 }}>Google Drive 手動上傳</h2>
            <div className="muted" style={{ marginTop: 6 }}>
              這裡只處理目前停車場；每一天由現場人員確認後手動上傳一個完整 ZIP。
            </div>
          </div>
          <button type="button" onClick={() => void loadDriveStatus()}>
            重新檢查 Drive
          </button>
        </div>

        {driveStatus?.configured ? (
          <div style={{ marginTop: 10, color: '#166534', fontWeight: 800 }}>
            Google Drive 已可使用。每日資料夾右側會顯示「上傳到 Google Drive」。
          </div>
        ) : (
          <div style={{ marginTop: 10, color: '#b91c1c', fontWeight: 700 }}>
            {!driveStatus
              ? '尚未取得 Google Drive 設定狀態。'
              : !driveStatus.credentialsConfigured
                ? 'Vercel 尚未完成 Google Drive 服務帳號設定。'
                : !driveStatus.rootConfigured
                  ? '尚未設定公司 Google Drive 總資料夾，請主管先到報表中心完成一次設定。'
                  : 'Google Drive 尚未可用，請重新檢查設定。'}
          </div>
        )}

        {driveStatus?.rootFolderUrl && (
          <div style={{ marginTop: 8 }}>
            <a
              href={driveStatus.rootFolderUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontWeight: 700 }}
            >
              開啟公司 Google Drive 總資料夾
            </a>
          </div>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))',
          gap: 16,
          marginTop: 18,
        }}
      >
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>作業照片上傳</h2>
          <p className="muted">
            現場照片可複選；上傳完成後不用逐張整理，系統會直接放進當日資料夾。
          </p>

          <div className="field">
            <label>照片（可複選）</label>
            <input
              id="dengue-photo-files"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) =>
                setPhotoFiles(Array.from(event.target.files || []))
              }
            />
          </div>

          <button
            type="button"
            className="btn"
            disabled={savingPhotos || !photoFiles.length}
            onClick={uploadPhotos}
            style={{ marginTop: 14 }}
          >
            {savingPhotos
              ? '上傳中…'
              : `上傳${photoFiles.length ? ` ${photoFiles.length} 張` : ''}照片`}
          </button>
        </div>

        {workType === '自主檢查' ? (
          <div className="card" style={{ padding: 20 }}>
            <h2 style={{ marginTop: 0 }}>報表上傳</h2>
            <p className="muted">
              自主檢查完成後可上傳報表；同日照片與報表下載時會整理在同一個每日 ZIP 裡。
            </p>

            <div className="field">
              <label>報表檔案</label>
              <input
                id="dengue-report-file"
                type="file"
                accept=".pdf,.xlsx,.xls,.doc,.docx,.jpg,.jpeg,.png"
                onChange={(event) =>
                  setReportFile(event.target.files?.[0] || null)
                }
              />
            </div>

            {reportFile && (
              <div className="muted" style={{ marginTop: 8 }}>
                {reportFile.name}｜{formatBytes(reportFile.size)}
              </div>
            )}

            <button
              type="button"
              className="btn"
              disabled={savingReport || !reportFile}
              onClick={uploadReport}
              style={{ marginTop: 14 }}
            >
              {savingReport ? '上傳中…' : '上傳報表'}
            </button>
          </div>
        ) : (
          <div className="card" style={{ padding: 20 }}>
            <h2 style={{ marginTop: 0 }}>委外消毒</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              委外消毒只需要上傳作業照片；同一天的照片會集中成一個每日資料夾，不需要逐張下載。
            </p>
          </div>
        )}
      </div>

      {message && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            background:
              message.includes('失敗') || message.includes('錯誤')
                ? '#fef2f2'
                : '#f0fdf4',
            color:
              message.includes('失敗') || message.includes('錯誤')
                ? '#b91c1c'
                : '#166534',
            fontWeight: 700,
          }}
        >
          {message}
        </div>
      )}

      <div className="card" style={{ marginTop: 18, padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>每日作業資料夾</h2>
        <p className="muted">
          每個日期只顯示一個資料夾。按「下載當日資料夾」會一次取得當日所有照片與報表 ZIP。
        </p>

        {!dailyFolders.length ? (
          <div className="muted">最近 6 個月尚無資料。</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {dailyFolders.map((folder) => (
              <div
                key={folder.date}
                style={{
                  border: '1px solid #dbe3ec',
                  borderRadius: 12,
                  padding: 16,
                  background: '#fff',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 900 }}>
                      📁 {folder.date}
                    </div>
                    <div className="muted" style={{ marginTop: 5 }}>
                      {folder.workTypes.join('＋') || '登革熱作業'}｜照片 {folder.photoCount}{' '}
                      張
                      {folder.reportCount > 0
                        ? `｜報表 ${folder.reportCount} 份`
                        : ''}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <button
                      type="button"
                      className="btn"
                      disabled={Boolean(downloadingDate) || Boolean(uploadingDriveDate)}
                      onClick={() => downloadDay(folder.date)}
                    >
                      {downloadingDate === folder.date
                        ? '整理 ZIP 中…'
                        : '下載當日資料夾'}
                    </button>

                    <button
                      type="button"
                      className="btn"
                      disabled={
                        !driveStatus?.configured ||
                        Boolean(uploadingDriveDate) ||
                        Boolean(downloadingDate)
                      }
                      onClick={() => void uploadDayToDrive(folder.date)}
                    >
                      {uploadingDriveDate === folder.date
                        ? '上傳 Drive 中…'
                        : '上傳到 Google Drive'}
                    </button>

                    {driveStatus?.archives?.[folder.date] && (
                      <span style={{ color: '#166534', fontWeight: 800 }}>
                        曾歸檔
                      </span>
                    )}
                  </div>
                </div>

                {driveStatus?.archives?.[folder.date] && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 8,
                      background: '#f0fdf4',
                      color: '#166534',
                    }}
                  >
                    Google Drive 最近上傳：
                    {new Date(
                      driveStatus.archives[folder.date].archivedAt
                    ).toLocaleString('zh-TW')}
                    {driveStatus.archives[folder.date].fileUrl && (
                      <>
                        {' '}｜{' '}
                        <a
                          href={driveStatus.archives[folder.date].fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontWeight: 800 }}
                        >
                          開啟雲端檔案
                        </a>
                      </>
                    )}
                  </div>
                )}

                <details style={{ marginTop: 12 }}>
                  <summary
                    style={{
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    查看檔案明細／刪除誤傳檔案
                  </summary>

                  <div style={{ overflowX: 'auto', marginTop: 10 }}>
                    <table
                      style={{
                        width: '100%',
                        minWidth: 760,
                        borderCollapse: 'collapse',
                      }}
                    >
                      <thead>
                        <tr>
                          <th>作業類型</th>
                          <th>資料類型</th>
                          <th>檔名</th>
                          <th>備註</th>
                          <th>上傳時間</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {folder.rows.map((row) => (
                          <tr
                            key={row.id}
                            style={{ borderTop: '1px solid #e5e7eb' }}
                          >
                            <td style={{ padding: 8 }}>{row.work_type}</td>
                            <td style={{ padding: 8 }}>{kindText(row.file_kind)}</td>
                            <td style={{ padding: 8 }}>{row.file_name}</td>
                            <td style={{ padding: 8 }}>{row.note || '-'}</td>
                            <td style={{ padding: 8 }}>
                              {new Date(row.uploaded_at).toLocaleString('zh-TW')}
                            </td>
                            <td style={{ padding: 8 }}>
                              <button
                                type="button"
                                onClick={() => remove(row)}
                                style={{ color: '#b91c1c' }}
                              >
                                刪除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
