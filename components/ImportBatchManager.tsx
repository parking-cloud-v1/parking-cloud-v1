'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Batch = {
  id: string

  parking_lot_id: string

  file_name: string | null

  total_rows: number

  inserted_rows: number
  updated_rows: number
  cancelled_rows: number

  status: string

  imported_at: string

  rolled_back_at?: string | null

  parking_lots?: {
    name: string
  } | null
}

export default function ImportBatchManager({
  batches,
}: {
  batches: Batch[]
}) {
  const [
    workingId,
    setWorkingId,
  ] = useState('')

  async function rollbackBatch(
    batch: Batch
  ) {
    if (
      batch.status !== 'completed'
    ) {
      alert(
        '這一筆匯入目前不能撤銷。'
      )

      return
    }

    const confirmed =
      window.confirm(
        `確定撤銷這一次總表匯入嗎？\n\n` +
          `停車場：${batch.parking_lots?.name || '-'}\n` +
          `檔案：${batch.file_name || '-'}\n\n` +
          `新增：${batch.inserted_rows} 筆\n` +
          `資料異動：${batch.updated_rows} 筆\n` +
          `退租：${batch.cancelled_rows} 筆\n\n` +
          `撤銷後：\n` +
          `・本次新增的月租資料會刪除\n` +
          `・本次修改的資料會恢復\n` +
          `・本次被判定退租的資料會恢復為原狀\n\n` +
          `確定要繼續嗎？`
      )

    if (!confirmed) {
      return
    }

    setWorkingId(
      batch.id
    )

    try {
      const supabase =
        createClient()

      /*
       * 1.
       * 取得這一批的所有快照
       *
       * created_at DESC：
       * 如果同一資料有多筆操作，
       * 由後往前還原會比較安全。
       */
      const {
        data: snapshots,
        error: snapshotError,
      } =
        await supabase
          .from(
            'monthly_import_snapshots'
          )
          .select(`
            id,
            batch_id,
            parking_lot_id,
            monthly_rental_id,
            action_type,
            customer_code,
            customer_name,
            phone,
            vehicle_plate,
            vehicle_type,
            rental_type,
            start_date,
            end_date,
            monthly_fee,
            payment_status,
            rental_status,
            payment_date,
            invoice_number,
            notes,
            created_at
          `)
          .eq(
            'batch_id',
            batch.id
          )
          .order(
            'created_at',
            {
              ascending: false,
            }
          )

      if (snapshotError) {
        alert(
          `讀取匯入快照失敗：${snapshotError.message}`
        )

        return
      }

      /*
       * 2.
       * 先還原 update / cancel
       */
      for (
        const snapshot of
        snapshots || []
      ) {
        if (
          snapshot.action_type ===
          'insert'
        ) {
          continue
        }

        if (
          !snapshot.monthly_rental_id
        ) {
          continue
        }

        const {
          error: restoreError,
        } =
          await supabase
            .from(
              'monthly_rentals'
            )
            .update({
              customer_code:
                snapshot.customer_code,

              customer_name:
                snapshot.customer_name,

              phone:
                snapshot.phone,

              vehicle_plate:
                snapshot.vehicle_plate,

              vehicle_type:
                snapshot.vehicle_type,

              rental_type:
                snapshot.rental_type,

              start_date:
                snapshot.start_date,

              end_date:
                snapshot.end_date,

              monthly_fee:
                snapshot.monthly_fee,

              payment_status:
                snapshot.payment_status,

              rental_status:
                snapshot.rental_status,

              payment_date:
                snapshot.payment_date,

              invoice_number:
                snapshot.invoice_number,

              notes:
                snapshot.notes,

              last_import_batch_id:
                null,

              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              'id',
              snapshot.monthly_rental_id
            )

        if (restoreError) {
          alert(
            `恢復月租資料失敗：${restoreError.message}`
          )

          return
        }
      }

      /*
       * 3.
       * 找出本次「新增」的資料
       */
      const insertedSnapshots =
        (
          snapshots ||
          []
        ).filter(
          (snapshot) =>
            snapshot.action_type ===
            'insert'
        )

      /*
       * 4.
       * 刪除這次新增的月租資料
       */
      for (
        const snapshot of
        insertedSnapshots
      ) {
        if (
          !snapshot.monthly_rental_id
        ) {
          continue
        }

        const {
          error: deleteError,
        } =
          await supabase
            .from(
              'monthly_rentals'
            )
            .delete()
            .eq(
              'id',
              snapshot.monthly_rental_id
            )

        if (deleteError) {
          alert(
            `刪除本次新增資料失敗：${deleteError.message}`
          )

          return
        }
      }

      /*
       * 5.
       * 刪除這一批產生的
       * 簽約異動紀錄
       *
       * 這樣撤銷之後，
       * 會計異動頁也不會留下
       * 已經取消的錯誤紀錄。
       */
      const {
        error:
          deleteChangeError,
      } =
        await supabase
          .from(
            'monthly_rental_changes'
          )
          .delete()
          .eq(
            'import_batch_id',
            batch.id
          )

      if (
        deleteChangeError
      ) {
        alert(
          `移除簽約異動失敗：${deleteChangeError.message}`
        )

        return
      }

      /*
       * 6.
       * 將批次改成已撤銷
       */
      const {
        error: batchError,
      } =
        await supabase
          .from(
            'monthly_import_batches'
          )
          .update({
            status:
              'rolled_back',

            rolled_back_at:
              new Date()
                .toISOString(),
          })
          .eq(
            'id',
            batch.id
          )

      if (batchError) {
        alert(
          `更新匯入紀錄失敗：${batchError.message}`
        )

        return
      }

      alert(
        '本次匯入已成功撤銷。'
      )

      window.location.reload()
    } catch (
      error: any
    ) {
      console.error(
        error
      )

      alert(
        `撤銷失敗：${
          error?.message ||
          '未知錯誤'
        }`
      )
    } finally {
      setWorkingId('')
    }
  }

  function formatDateTime(
    value: string
  ) {
    if (!value) {
      return '-'
    }

    const date =
      new Date(value)

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return value
    }

    /*
     * 固定轉成台灣時間 UTC+8。
     *
     * 不使用 toLocaleString()，
     * 避免 Next.js SSR 與瀏覽器端
     * 因時區不同產生 Hydration mismatch。
     */
    const taipeiTime =
      new Date(
        date.getTime() +
          8 * 60 * 60 * 1000
      )

    const year =
      taipeiTime.getUTCFullYear()

    const month =
      String(
        taipeiTime.getUTCMonth() +
          1
      ).padStart(2, '0')

    const day =
      String(
        taipeiTime.getUTCDate()
      ).padStart(2, '0')

    const hour =
      String(
        taipeiTime.getUTCHours()
      ).padStart(2, '0')

    const minute =
      String(
        taipeiTime.getUTCMinutes()
      ).padStart(2, '0')

    const second =
      String(
        taipeiTime.getUTCSeconds()
      ).padStart(2, '0')

    return (
      `${year}/${month}/${day} ` +
      `${hour}:${minute}:${second}`
    )
  }

  function statusText(
    status: string
  ) {
    if (
      status ===
      'completed'
    ) {
      return '已完成'
    }

    if (
      status ===
      'rolled_back'
    ) {
      return '已撤銷'
    }

    if (
      status ===
      'failed'
    ) {
      return '有錯誤'
    }

    if (
      status ===
      'processing'
    ) {
      return '處理中'
    }

    return status
  }

  function statusColor(
    status: string
  ) {
    if (
      status ===
      'completed'
    ) {
      return '#15803d'
    }

    if (
      status ===
      'rolled_back'
    ) {
      return '#64748b'
    }

    if (
      status ===
      'failed'
    ) {
      return '#dc2626'
    }

    return '#d97706'
  }

  return (
    <div
      className="card"
      style={{
        marginTop:
          24,
      }}
    >
      <div
        style={{
          display:
            'flex',
          justifyContent:
            'space-between',
          alignItems:
            'center',
          gap:
            12,
          flexWrap:
            'wrap',
        }}
      >
        <div>
          <h2
            style={{
              margin:
                0,
            }}
          >
            總表匯入紀錄
          </h2>

          <p
            className="muted"
            style={{
              marginBottom:
                0,
            }}
          >
            如果總表匯錯停車場或匯錯檔案，可撤銷該次匯入。
          </p>
        </div>
      </div>

      {!batches.length ? (
        <p
          className="muted"
          style={{
            marginTop:
              18,
          }}
        >
          尚無新版總表匯入紀錄。
        </p>
      ) : (
        <div
          style={{
            overflowX:
              'auto',
            marginTop:
              18,
          }}
        >
          <table
            style={{
              width:
                '100%',
              minWidth:
                1050,
              borderCollapse:
                'collapse',
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign:
                    'left',
                }}
              >
                <th
                  style={{
                    padding:
                      10,
                  }}
                >
                  匯入時間
                </th>

                <th
                  style={{
                    padding:
                      10,
                  }}
                >
                  停車場
                </th>

                <th
                  style={{
                    padding:
                      10,
                  }}
                >
                  檔案
                </th>

                <th
                  style={{
                    padding:
                      10,
                  }}
                >
                  總筆數
                </th>

                <th
                  style={{
                    padding:
                      10,
                  }}
                >
                  新增
                </th>

                <th
                  style={{
                    padding:
                      10,
                  }}
                >
                  資料異動
                </th>

                <th
                  style={{
                    padding:
                      10,
                  }}
                >
                  退租
                </th>

                <th
                  style={{
                    padding:
                      10,
                  }}
                >
                  狀態
                </th>

                <th
                  style={{
                    padding:
                      10,
                  }}
                >
                  操作
                </th>
              </tr>
            </thead>

            <tbody>
              {batches.map(
                (
                  batch
                ) => (
                  <tr
                    key={
                      batch.id
                    }
                    style={{
                      borderTop:
                        '1px solid #e5e7eb',
                    }}
                  >
                    <td
                      style={{
                        padding:
                          10,
                        whiteSpace:
                          'nowrap',
                      }}
                    >
                      {formatDateTime(
                        batch.imported_at
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          10,
                        minWidth:
                          190,
                      }}
                    >
                      {batch
                        .parking_lots
                        ?.name ||
                        '-'}
                    </td>

                    <td
                      style={{
                        padding:
                          10,
                        minWidth:
                          170,
                      }}
                    >
                      {batch.file_name ||
                        '-'}
                    </td>

                    <td
                      style={{
                        padding:
                          10,
                      }}
                    >
                      {
                        batch.total_rows
                      }
                    </td>

                    <td
                      style={{
                        padding:
                          10,
                        color:
                          batch.inserted_rows >
                          0
                            ? '#15803d'
                            : undefined,
                        fontWeight:
                          batch.inserted_rows >
                          0
                            ? 700
                            : 400,
                      }}
                    >
                      {
                        batch.inserted_rows
                      }
                    </td>

                    <td
                      style={{
                        padding:
                          10,
                        color:
                          batch.updated_rows >
                          0
                            ? '#d97706'
                            : undefined,
                        fontWeight:
                          batch.updated_rows >
                          0
                            ? 700
                            : 400,
                      }}
                    >
                      {
                        batch.updated_rows
                      }
                    </td>

                    <td
                      style={{
                        padding:
                          10,
                        color:
                          batch.cancelled_rows >
                          0
                            ? '#dc2626'
                            : undefined,
                        fontWeight:
                          batch.cancelled_rows >
                          0
                            ? 700
                            : 400,
                      }}
                    >
                      {
                        batch.cancelled_rows
                      }
                    </td>

                    <td
                      style={{
                        padding:
                          10,
                        whiteSpace:
                          'nowrap',
                        color:
                          statusColor(
                            batch.status
                          ),
                        fontWeight:
                          700,
                      }}
                    >
                      {statusText(
                        batch.status
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          10,
                        whiteSpace:
                          'nowrap',
                      }}
                    >
                      {batch.status ===
                        'completed' && (
                        <button
                          type="button"
                          disabled={
                            workingId ===
                            batch.id
                          }
                          onClick={() =>
                            rollbackBatch(
                              batch
                            )
                          }
                          style={{
                            padding:
                              '7px 11px',

                            border:
                              '1px solid #fecaca',

                            borderRadius:
                              7,

                            background:
                              '#fff',

                            color:
                              '#dc2626',

                            fontWeight:
                              600,

                            cursor:
                              workingId ===
                              batch.id
                                ? 'not-allowed'
                                : 'pointer',

                            opacity:
                              workingId ===
                              batch.id
                                ? 0.6
                                : 1,
                          }}
                        >
                          {workingId ===
                          batch.id
                            ? '撤銷中…'
                            : '撤銷本次匯入'}
                        </button>
                      )}

                      {batch.status ===
                        'rolled_back' && (
                        <span
                          style={{
                            color:
                              '#64748b',
                          }}
                        >
                          已撤銷
                        </span>
                      )}

                      {batch.status ===
                        'failed' && (
                        <span
                          style={{
                            color:
                              '#dc2626',
                          }}
                        >
                          請檢查
                        </span>
                      )}

                      {batch.status ===
                        'processing' && (
                        <span
                          style={{
                            color:
                              '#d97706',
                          }}
                        >
                          處理中
                        </span>
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}