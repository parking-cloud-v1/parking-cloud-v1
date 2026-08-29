import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import RentalChangesExportButton from '@/components/RentalChangesExportButton'

/* =========================================================
   異動類型文字
========================================================= */

function changeTypeText(type: string) {
  if (type === 'joined') {
    return '新增'
  }

  if (type === 'cancelled') {
    return '退租'
  }

  if (type === 'updated') {
    return '資料異動'
  }

  return type
}

/* =========================================================
   異動類型顏色
========================================================= */

function changeTypeColor(type: string) {
  if (type === 'joined') {
    return '#15803d'
  }

  if (type === 'cancelled') {
    return '#dc2626'
  }

  if (type === 'updated') {
    return '#d97706'
  }

  return '#334155'
}

/* =========================================================
   來源名稱
========================================================= */

function sourceText(source?: string | null) {
  if (source === 'legacy_import') {
    return '總表匯入'
  }

  if (source === 'monthly_rentals') {
    return '月租管理'
  }

  if (source === 'annual_roster') {
    return '年度抽籤'
  }

  return source || '-'
}

/* =========================================================
   車種
========================================================= */

function vehicleTypeText(type?: string | null) {
  if (type === 'car') {
    return '汽車'
  }

  if (type === 'motorcycle') {
    return '機車'
  }

  if (type === 'heavy_motorcycle') {
    return '重機'
  }

  return '-'
}

/* =========================================================
   主頁面
========================================================= */

export default async function MonthlyRentalChangesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    from?: string
    to?: string
    lot?: string
    type?: string
  }>
}) {
  const supabase = await createClient()

  /* =======================================================
     登入確認
  ======================================================= */

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !profile.is_active) {
    redirect('/login')
  }

  /* =======================================================
     查詢條件
  ======================================================= */

  const params = searchParams
    ? await searchParams
    : {}

  const from = params.from || ''
  const to = params.to || ''
  const lot = params.lot || ''
  const type = params.type || ''

  /* =======================================================
     停車場
  ======================================================= */

  const { data: parkingLots } = await supabase
    .from('parking_lots')
    .select('id, name')
    .eq('status', 'active')
    .order('name')

  /* =======================================================
     月租異動查詢
  ======================================================= */

  let query = supabase
    .from('monthly_rental_changes')
    .select(`
      id,
      parking_lot_id,
      monthly_rental_id,

      customer_code,
      customer_name,
      phone,
      vehicle_plate,
      vehicle_type,
      rental_type,

      change_type,
      effective_date,

      reason,
      change_detail,
      source,
      import_batch_id,

      created_at,

      parking_lots (
        id,
        name
      ),

      monthly_import_batches (
        id,
        file_name,
        imported_at
      )
    `)
    .order('effective_date', {
      ascending: false,
    })
    .order('created_at', {
      ascending: false,
    })

  /* 開始日期 */

  if (from) {
    query = query.gte(
      'effective_date',
      from
    )
  }

  /* 結束日期 */

  if (to) {
    query = query.lte(
      'effective_date',
      to
    )
  }

  /* 停車場 */

  if (lot) {
    query = query.eq(
      'parking_lot_id',
      lot
    )
  }

  /* 異動類型 */

  if (type) {
    query = query.eq(
      'change_type',
      type
    )
  }

  const {
    data: changes,
    error,
  } = await query

  /* =======================================================
     統計
  ======================================================= */

  const totalCount =
    changes?.length || 0

  const joinedCount =
    changes?.filter(
      (item: any) =>
        item.change_type === 'joined'
    ).length || 0

  const cancelledCount =
    changes?.filter(
      (item: any) =>
        item.change_type === 'cancelled'
    ).length || 0

  const updatedCount =
    changes?.filter(
      (item: any) =>
        item.change_type === 'updated'
    ).length || 0

  /* =======================================================
     Excel 匯出資料
  ======================================================= */

  const exportRows =
    changes?.map(
      (item: any) => ({
        parking_lot_name:
          item.parking_lots?.name ||
          '',

        customer_code:
          item.customer_code ||
          '',

        customer_name:
          item.customer_name ||
          '',

        phone:
          item.phone ||
          '',

        vehicle_plate:
          item.vehicle_plate ||
          '',

        vehicle_type:
          item.vehicle_type ||
          '',

        rental_type:
          item.rental_type ||
          '',

        change_type:
          item.change_type,

        effective_date:
          item.effective_date,

        reason:
          item.reason ||
          '',

        change_detail:
          item.change_detail ||
          '',

        source:
          item.source ||
          '',
      })
    ) || []

  /* =======================================================
     畫面
  ======================================================= */

  return (
    <div>

      {/* ===================================================
          標題
      =================================================== */}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              marginBottom: 6,
            }}
          >
            月租簽約異動
          </h1>

          <p
            className="muted"
            style={{
              marginTop: 0,
            }}
          >
            查詢期間內新增、退租及資料異動名單，提供會計同步月租簽約單。
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <RentalChangesExportButton
            rows={exportRows}
          />

          <Link
            href="/dashboard/monthly-rentals"
            style={{
              padding: '9px 14px',
              border:
                '1px solid #cbd5e1',
              borderRadius: 8,
              textDecoration: 'none',
              color: '#475569',
              background: '#fff',
            }}
          >
            返回月租管理
          </Link>
        </div>
      </div>

      {/* ===================================================
          篩選
      =================================================== */}

      <div
        className="card"
        style={{
          marginTop: 24,
        }}
      >
        <form
          method="GET"
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 12,
            alignItems: 'end',
          }}
        >

          {/* 開始日期 */}

          <div className="field">
            <label>
              開始日期
            </label>

            <input
              type="date"
              name="from"
              defaultValue={from}
            />
          </div>

          {/* 結束日期 */}

          <div className="field">
            <label>
              結束日期
            </label>

            <input
              type="date"
              name="to"
              defaultValue={to}
            />
          </div>

          {/* 停車場 */}

          <div className="field">
            <label>
              停車場
            </label>

            <select
              name="lot"
              defaultValue={lot}
            >
              <option value="">
                全部停車場
              </option>

              {parkingLots?.map(
                (item: any) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                )
              )}
            </select>
          </div>

          {/* 異動類型 */}

          <div className="field">
            <label>
              異動類型
            </label>

            <select
              name="type"
              defaultValue={type}
            >
              <option value="">
                全部
              </option>

              <option value="joined">
                新增
              </option>

              <option value="cancelled">
                退租
              </option>

              <option value="updated">
                資料異動
              </option>
            </select>
          </div>

          {/* 查詢按鈕 */}

          <div
            style={{
              display: 'flex',
              gap: 8,
            }}
          >
            <button
              type="submit"
              className="btn"
            >
              查詢
            </button>

            <Link
              href="/dashboard/monthly-rentals/changes"
              style={{
                padding: '9px 14px',
                border:
                  '1px solid #cbd5e1',
                borderRadius: 8,
                textDecoration:
                  'none',
                color: '#475569',
                background: '#fff',
              }}
            >
              清除
            </Link>
          </div>
        </form>
      </div>

      {/* ===================================================
          統計卡
      =================================================== */}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(4, minmax(170px, 1fr))',
          gap: 14,
          marginTop: 20,
          overflowX: 'auto',
        }}
      >

        {/* 全部 */}

        <div className="card">
          <div
            style={{
              color: '#64748b',
            }}
          >
            本期間異動
          </div>

          <h2
            style={{
              marginBottom: 0,
            }}
          >
            {totalCount} 筆
          </h2>
        </div>

        {/* 新增 */}

        <div className="card">
          <div
            style={{
              color: '#15803d',
              fontWeight: 700,
            }}
          >
            新加入
          </div>

          <h2
            style={{
              marginBottom: 0,
              color: '#15803d',
            }}
          >
            {joinedCount} 筆
          </h2>
        </div>

        {/* 退租 */}

        <div className="card">
          <div
            style={{
              color: '#dc2626',
              fontWeight: 700,
            }}
          >
            退租
          </div>

          <h2
            style={{
              marginBottom: 0,
              color: '#dc2626',
            }}
          >
            {cancelledCount} 筆
          </h2>
        </div>

        {/* 資料異動 */}

        <div className="card">
          <div
            style={{
              color: '#d97706',
              fontWeight: 700,
            }}
          >
            資料異動
          </div>

          <h2
            style={{
              marginBottom: 0,
              color: '#d97706',
            }}
          >
            {updatedCount} 筆
          </h2>
        </div>
      </div>

      {/* ===================================================
          異動名單
      =================================================== */}

      <div
        className="card"
        style={{
          marginTop: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent:
              'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <h2
            style={{
              margin: 0,
            }}
          >
            簽約異動名單
          </h2>

          <span className="muted">
            共 {totalCount} 筆
          </span>
        </div>

        {/* 錯誤 */}

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              background:
                '#fef2f2',
              color: '#dc2626',
            }}
          >
            讀取異動資料失敗：
            {error.message}
          </div>
        )}

        {/* 無資料 */}

        {!error &&
        (!changes ||
          changes.length === 0) && (
          <div
            style={{
              marginTop: 20,
              padding: 20,
              textAlign: 'center',
              color: '#64748b',
            }}
          >
            此查詢條件目前沒有月租異動資料。
          </div>
        )}

        {/* 表格 */}

        {!error &&
        changes &&
        changes.length > 0 && (
          <div
            style={{
              overflowX: 'auto',
              marginTop: 16,
            }}
          >
            <table
              style={{
                width: '100%',
                minWidth: 1500,
                borderCollapse:
                  'collapse',
              }}
            >
              <thead>
                <tr
                  style={{
                    textAlign: 'left',
                  }}
                >
                  <th
                    style={{
                      padding: 10,
                    }}
                  >
                    日期
                  </th>

                  <th
                    style={{
                      padding: 10,
                    }}
                  >
                    異動
                  </th>

                  <th
                    style={{
                      padding: 10,
                    }}
                  >
                    停車場
                  </th>

                  <th
                    style={{
                      padding: 10,
                    }}
                  >
                    客戶編號
                  </th>

                  <th
                    style={{
                      padding: 10,
                    }}
                  >
                    姓名
                  </th>

                  <th
                    style={{
                      padding: 10,
                    }}
                  >
                    電話
                  </th>

                  <th
                    style={{
                      padding: 10,
                    }}
                  >
                    車牌
                  </th>

                  <th
                    style={{
                      padding: 10,
                    }}
                  >
                    車種
                  </th>

                  <th
                    style={{
                      padding: 10,
                    }}
                  >
                    類型
                  </th>

                  <th
                    style={{
                      padding: 10,
                    }}
                  >
                    異動內容
                  </th>

                  <th
                    style={{
                      padding: 10,
                    }}
                  >
                    原因
                  </th>

                  <th
                    style={{
                      padding: 10,
                    }}
                  >
                    來源
                  </th>

                  <th
                    style={{
                      padding: 10,
                    }}
                  >
                    匯入檔案
                  </th>
                </tr>
              </thead>

              <tbody>
                {changes.map(
                  (item: any) => (
                    <tr
                      key={item.id}
                      style={{
                        borderTop:
                          '1px solid #e5e7eb',
                      }}
                    >

                      {/* 日期 */}

                      <td
                        style={{
                          padding: 10,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {item.effective_date ||
                          '-'}
                      </td>

                      {/* 異動類型 */}

                      <td
                        style={{
                          padding: 10,
                          whiteSpace:
                            'nowrap',
                          fontWeight: 700,
                          color:
                            changeTypeColor(
                              item.change_type
                            ),
                        }}
                      >
                        {changeTypeText(
                          item.change_type
                        )}
                      </td>

                      {/* 停車場 */}

                      <td
                        style={{
                          padding: 10,
                          minWidth: 210,
                        }}
                      >
                        {item.parking_lots
                          ?.name ||
                          '-'}
                      </td>

                      {/* 客戶編號 */}

                      <td
                        style={{
                          padding: 10,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {item.customer_code ||
                          '-'}
                      </td>

                      {/* 姓名 */}

                      <td
                        style={{
                          padding: 10,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {item.customer_name ||
                          '-'}
                      </td>

                      {/* 電話 */}

                      <td
                        style={{
                          padding: 10,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {item.phone ||
                          '-'}
                      </td>

                      {/* 車牌 */}

                      <td
                        style={{
                          padding: 10,
                          whiteSpace:
                            'nowrap',
                          fontWeight: 700,
                        }}
                      >
                        {item.vehicle_plate ||
                          '-'}
                      </td>

                      {/* 車種 */}

                      <td
                        style={{
                          padding: 10,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {vehicleTypeText(
                          item.vehicle_type
                        )}
                      </td>

                      {/* 類型 */}

                      <td
                        style={{
                          padding: 10,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {item.rental_type ||
                          '-'}
                      </td>

                      {/* 異動內容 */}

                      <td
                        style={{
                          padding: 10,
                          minWidth: 300,
                          color:
                            item.change_type ===
                            'updated'
                              ? '#b45309'
                              : '#475569',
                        }}
                      >
                        {item.change_detail ||
                          '-'}
                      </td>

                      {/* 原因 */}

                      <td
                        style={{
                          padding: 10,
                          minWidth: 180,
                        }}
                      >
                        {item.reason ||
                          '-'}
                      </td>

                      {/* 來源 */}

                      <td
                        style={{
                          padding: 10,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {sourceText(
                          item.source
                        )}
                      </td>

                      {/* 匯入檔案 */}

                      <td
                        style={{
                          padding: 10,
                          minWidth: 170,
                        }}
                      >
                        {item
                          .monthly_import_batches
                          ?.file_name ||
                          '-'}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}