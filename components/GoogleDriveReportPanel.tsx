'use client'

import {
  useEffect,
  useState,
} from 'react'

type Category =
  | 'attendance'
  | 'dengue'
  | 'violation'

type StatusData = {
  configured: Record<
    Category,
    boolean
  >
  folderUrls: Record<
    Category,
    string
  >
  counts: Record<
    Category,
    number
  >
}

const LABELS: Record<
  Category,
  string
> = {
  attendance:
    '每月簽到表',
  dengue:
    '登革熱自主檢查報表',
  violation:
    '違規停車照片',
}

export default function GoogleDriveReportPanel({
  month,
}: {
  month: string
}) {
  const [
    status,
    setStatus,
  ] =
    useState<
      StatusData | null
    >(null)

  const [
    loading,
    setLoading,
  ] =
    useState(false)

  const [
    uploading,
    setUploading,
  ] =
    useState<
      Category | ''
    >('')

  const [
    message,
    setMessage,
  ] =
    useState('')

  async function load() {
    if (!month) return

    setLoading(true)

    try {
      const response =
        await fetch(
          `/api/report-center/google-drive?month=${encodeURIComponent(
            month
          )}`,
          {
            cache:
              'no-store',
          }
        )

      const json =
        await response.json()

      if (!response.ok) {
        throw new Error(
          json?.error ||
            'Google Drive 狀態讀取失敗'
        )
      }

      setStatus(
        json
      )
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          'Google Drive 狀態讀取失敗'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(
    () => {
      void load()
    },
    [
      month,
    ]
  )

  async function upload(
    category:
      Category
  ) {
    if (
      uploading
    ) {
      return
    }

    if (
      !window.confirm(
        `確定把 ${month}「${LABELS[category]}」上傳到指定 Google Drive 資料夾？\n\n原本 Supabase 檔案不會刪除。`
      )
    ) {
      return
    }

    setUploading(
      category
    )

    setMessage(
      `${LABELS[category]} 正在上傳 Google Drive…`
    )

    try {
      const response =
        await fetch(
          '/api/report-center/google-drive',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                category,
                month,
              }),
          }
        )

      const json =
        await response.json()

      if (!response.ok) {
        throw new Error(
          json?.error ||
            'Google Drive 上傳失敗'
        )
      }

      setMessage(
        `${LABELS[category]} 上傳完成：成功 ${json.uploaded || 0} 份、失敗 ${json.failed || 0} 份。` +
          (
            json.failures
              ?.length
              ? `\n${json.failures.join(
                  '\n'
                )}`
              : ''
          )
      )

      await load()
    } catch (
      error: any
    ) {
      setMessage(
        error?.message ||
          'Google Drive 上傳失敗'
      )
    } finally {
      setUploading('')
    }
  }

  return (
    <div
      className="card"
      style={{
        marginTop:
          18,
      }}
    >
      <h2
        style={{
          marginTop:
            0,
        }}
      >
        Google Drive 一鍵歸檔
      </h2>

      <div
        className="muted"
        style={{
          marginBottom:
            14,
        }}
      >
        不再需要先下載 ZIP 再人工搬檔；直接把本月份檔案送到公司指定的 Google Drive 資料夾。
      </div>

      {loading && (
        <div className="muted">
          Google Drive 狀態讀取中…
        </div>
      )}

      <div
        style={{
          display:
            'grid',

          gridTemplateColumns:
            'repeat(auto-fit,minmax(240px,1fr))',

          gap:
            12,
        }}
      >
        {(
          [
            'attendance',
            'dengue',
            'violation',
          ] as Category[]
        ).map(
          (
            category
          ) => {
            const configured =
              status
                ?.configured[
                category
              ] ||
              false

            const count =
              status
                ?.counts[
                category
              ] ||
              0

            return (
              <div
                key={
                  category
                }
                style={{
                  border:
                    '1px solid #dbe3ec',
                  borderRadius:
                    10,
                  padding:
                    14,
                  background:
                    '#fff',
                }}
              >
                <strong>
                  {
                    LABELS[
                      category
                    ]
                  }
                </strong>

                <div
                  style={{
                    fontSize:
                      28,
                    fontWeight:
                      800,
                    marginTop:
                      8,
                  }}
                >
                  {count}{' '}
                  份
                </div>

                <div
                  className="muted"
                  style={{
                    marginTop:
                      4,
                  }}
                >
                  {configured
                    ? 'Google Drive 已設定'
                    : '尚未設定 Folder ID'}
                </div>

                <div
                  style={{
                    display:
                      'flex',
                    gap:
                      8,
                    flexWrap:
                      'wrap',
                    marginTop:
                      12,
                  }}
                >
                  <button
                    type="button"
                    className="btn"
                    disabled={
                      !configured ||
                      count ===
                        0 ||
                      Boolean(
                        uploading
                      )
                    }
                    onClick={() =>
                      upload(
                        category
                      )
                    }
                  >
                    {uploading ===
                    category
                      ? '上傳中…'
                      : '一鍵上傳'}
                  </button>

                  {status
                    ?.folderUrls[
                    category
                  ] && (
                    <a
                      href={
                        status
                          .folderUrls[
                          category
                        ]
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="btn"
                      style={{
                        textDecoration:
                          'none',
                      }}
                    >
                      開啟資料夾
                    </a>
                  )}
                </div>
              </div>
            )
          }
        )}
      </div>

      {message && (
        <div
          style={{
            marginTop:
              14,
            whiteSpace:
              'pre-wrap',
          }}
        >
          {message}
        </div>
      )}
    </div>
  )
}
