import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import MonthlyRentalActions from '@/components/MonthlyRentalActions'
import ExcelExportButton from '@/components/ExcelExportButton'
import CsvImportButton from '@/components/CsvImportButton'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'

function formatRentalPeriod(
  startDate?: string | null,
  endDate?: string | null
) {
  if (!startDate || !endDate) {
    return '-'
  }

  return `${startDate} 到 ${endDate}`
}

function vehicleTypeText(
  type?: string | null
) {
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

function rentalStatusText(
  status?: string | null
) {
  if (status === 'active') {
    return '使用中'
  }

  if (status === 'expired') {
    return '已到期'
  }

  if (status === 'cancelled') {
    return '已退租'
  }

  return status || '-'
}

/*
 * 防止舊資料仍殘留：
 * 里民,,,,,,
 * 身障,,,,,,
 */
function cleanRentalType(
  value?: string | null
) {
  if (!value) {
    return '-'
  }

  const source =
    String(value)
      .trim()
      .replace(/,+/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  if (
    source.includes(
      '老師汽車單月'
    )
  ) {
    return '老師汽車單月'
  }

  if (
    source.includes('老師') &&
    source.includes('機車')
  ) {
    return '老師機車'
  }

  if (
    source.includes('重機')
  ) {
    return '重機'
  }

  if (
    source.includes('身障')
  ) {
    return '身障'
  }

  if (
    source.includes('里民')
  ) {
    return '里民'
  }

  if (
    source.includes('一般')
  ) {
    return '一般'
  }

  if (
    source.includes('機車')
  ) {
    return '機車'
  }

  return source || '-'
}

export default async function MonthlyRentalsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string
    lot?: string
    payment?: string
    status?: string
  }>
}) {
  const supabase =
    await createClient()

  const {
    data: { user },
  } =
    await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const {
    data: profile,
  } =
    await supabase
      .from('profiles')
      .select(`
        id,
        role,
        is_active
      `)
      .eq(
        'id',
        user.id
      )
      .maybeSingle()

  if (
    !profile ||
    !profile.is_active
  ) {
    redirect('/login')
  }

  const params =
    searchParams
      ? await searchParams
      : {}

  const q =
    params.q || ''

  /*
   * 這裡不再使用網址上的 lot。
   * 全部以左側「目前工作停車場」為準。
   */
  const lot =
    await getCurrentWorkParkingLotId()

  const payment =
    params.payment || ''

  const status =
    params.status || ''

  const {
    data: parkingLots,
    error:
      parkingLotsError,
  } =
    await supabase
      .from(
        'parking_lots'
      )
      .select(
        'id, name'
      )
      .eq(
        'status',
        'active'
      )
      .order('name')

  const parkingLotOptions =
    (
      parkingLots ||
      []
    ).map(
      (item: any) => ({
        id: item.id,
        name: item.name,
      })
    )

  const currentParkingLot =
    parkingLotOptions.find(
      (item) =>
        item.id === lot
    )

  let query =
    supabase
      .from(
        'monthly_rentals'
      )
      .select(`
        id,
        parking_lot_id,

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
        payment_date,
        invoice_number,

        rental_status,

        notes,
        created_at,
        updated_at,

        parking_lots (
          id,
          name
        )
      `)
      .order(
        'parking_lot_id',
        {
          ascending:
            true,
        }
      )
      .order(
        'customer_code',
        {
          ascending:
            true,
          nullsFirst:
            false,
        }
      )
      .order(
        'customer_name',
        {
          ascending:
            true,
        }
      )

  if (q.trim()) {
    const keyword =
      q
        .trim()
        .replace(
          /,/g,
          ''
        )

    query =
      query.or(
        [
          `customer_code.ilike.%${keyword}%`,
          `customer_name.ilike.%${keyword}%`,
          `phone.ilike.%${keyword}%`,
          `vehicle_plate.ilike.%${keyword}%`,
        ].join(',')
      )
  }

  /*
   * 有選工作停車場：
   * 只顯示該停車場。
   *
   * 沒有選：
   * 故意查不存在的 ID，
   * 避免誤顯示全部停車場。
   */
  if (lot) {
    query =
      query.eq(
        'parking_lot_id',
        lot
      )
  } else {
    query =
      query.eq(
        'parking_lot_id',
        '__no_work_lot_selected__'
      )
  }

  if (payment) {
    query =
      query.eq(
        'payment_status',
        payment
      )
  }

  if (status) {
    query =
      query.eq(
        'rental_status',
        status
      )
  }

  const {
    data: rentals,
    error,
  } =
    await query

  const totalCount =
    rentals?.length ||
    0

  const paidCount =
    rentals?.filter(
      (item: any) =>
        item.payment_status ===
        'paid'
    ).length || 0

  const unpaidCount =
    rentals?.filter(
      (item: any) =>
        item.payment_status ===
        'unpaid'
    ).length || 0

  const activeCount =
    rentals?.filter(
      (item: any) =>
        item.rental_status ===
        'active'
    ).length || 0

  const exportRows =
    rentals?.map(
      (item: any) => ({
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
          cleanRentalType(
            item.rental_type
          ),

        start_date:
          item.start_date ||
          '',

        end_date:
          item.end_date ||
          '',

        monthly_fee:
          Number(
            item.monthly_fee ||
            0
          ),

        payment_status:
          item.payment_status ||
          '',

        rental_status:
          item.rental_status ||
          '',

        payment_date:
          item.payment_date ||
          '',

        invoice_number:
          item.invoice_number ||
          '',

        notes:
          item.notes ||
          '',
      })
    ) || []

  return (
    <div>
      {/* 標題 */}

      <div
        style={{
          display:
            'flex',
          justifyContent:
            'space-between',
          alignItems:
            'flex-start',
          gap: 16,
          flexWrap:
            'wrap',
        }}
      >
        <div>
          <h1
            style={{
              marginBottom:
                6,
            }}
          >
            月租管理
          </h1>

          <p
            className="muted"
            style={{
              marginTop:
                0,
            }}
          >
            {currentParkingLot
              ? `目前工作停車場：${currentParkingLot.name}`
              : '請先選擇目前工作停車場'}
          </p>
        </div>

        <div
          style={{
            display:
              'flex',
            gap: 8,
            flexWrap:
              'wrap',
            justifyContent:
              'flex-end',
          }}
        >
          <Link
            href={
              lot
                ? `/dashboard/monthly-rentals/import-legacy?lot=${encodeURIComponent(
                    lot
                  )}`
                : '/dashboard/monthly-rentals/import-legacy'
            }
            style={{
              padding:
                '9px 14px',
              border:
                '1px solid #cbd5e1',
              borderRadius:
                8,
              background:
                '#fff',
              color:
                '#334155',
              textDecoration:
                'none',
              fontWeight:
                600,
              pointerEvents:
                lot
                  ? 'auto'
                  : 'none',
              opacity:
                lot
                  ? 1
                  : 0.5,
            }}
          >
            匯入舊系統總表
          </Link>

          <CsvImportButton
            parkingLots={
              lot &&
              currentParkingLot
                ? [
                    currentParkingLot,
                  ]
                : []
            }
          />

          <Link
            href="/dashboard/monthly-rentals/payments"
            style={{
              padding:
                '9px 14px',
              border:
                '1px solid #cbd5e1',
              borderRadius:
                8,
              background:
                '#fff',
              color:
                '#334155',
              textDecoration:
                'none',
              fontWeight:
                600,
            }}
          >
            繳費紀錄
          </Link>

          <Link
            href="/dashboard/monthly-rentals/annual-rosters"
            style={{
              padding:
                '9px 14px',
              border:
                '1px solid #cbd5e1',
              borderRadius:
                8,
              background:
                '#fff',
              color:
                '#334155',
              textDecoration:
                'none',
              fontWeight:
                600,
            }}
          >
            年度抽籤總表
          </Link>

          <Link
            href="/dashboard/monthly-rentals/changes"
            style={{
              padding:
                '9px 14px',
              border:
                '1px solid #cbd5e1',
              borderRadius:
                8,
              background:
                '#fff',
              color:
                '#334155',
              textDecoration:
                'none',
              fontWeight:
                600,
            }}
          >
            簽約異動
          </Link>

          <ExcelExportButton
            rows={
              exportRows
            }
          />

          <Link
            href={
              lot
                ? `/dashboard/monthly-rentals/new?parking_lot_id=${encodeURIComponent(
                    lot
                  )}`
                : '/dashboard/monthly-rentals'
            }
            className="btn"
            style={{
              textDecoration:
                'none',
              pointerEvents:
                lot
                  ? 'auto'
                  : 'none',
              opacity:
                lot
                  ? 1
                  : 0.5,
            }}
          >
            ＋新增月租
          </Link>
        </div>
      </div>

      {/* 未選停車場 */}

      {!lot && (
        <div
          className="card"
          style={{
            marginTop:
              20,
            color:
              '#b45309',
            fontWeight:
              700,
            background:
              '#fffbeb',
          }}
        >
          請先在左側「目前工作停車場」選擇停車場。
          選擇後，月租管理會自動只顯示該停車場資料。
        </div>
      )}

      {/* 目前停車場 */}

      {lot &&
        currentParkingLot && (
          <div
            className="card"
            style={{
              marginTop:
                20,
              padding:
                16,
              background:
                '#f8fafc',
              border:
                '1px solid #cbd5e1',
            }}
          >
            <div
              style={{
                fontSize:
                  13,
                color:
                  '#64748b',
                marginBottom:
                  4,
              }}
            >
              目前工作停車場
            </div>

            <strong
              style={{
                fontSize:
                  18,
              }}
            >
              {
                currentParkingLot.name
              }
            </strong>
          </div>
        )}

      {/* 統計 */}

      <div
        style={{
          display:
            'grid',
          gridTemplateColumns:
            'repeat(4, minmax(150px, 1fr))',
          gap: 14,
          marginTop:
            22,
        }}
      >
        <div className="card">
          <div className="muted">
            月租資料
          </div>

          <h2>
            {totalCount} 筆
          </h2>
        </div>

        <div className="card">
          <div className="muted">
            使用中
          </div>

          <h2>
            {activeCount} 筆
          </h2>
        </div>

        <div className="card">
          <div
            style={{
              color:
                '#15803d',
              fontWeight:
                700,
            }}
          >
            已繳
          </div>

          <h2
            style={{
              color:
                '#15803d',
            }}
          >
            {paidCount} 筆
          </h2>
        </div>

        <div className="card">
          <div
            style={{
              color:
                '#dc2626',
              fontWeight:
                700,
            }}
          >
            未繳
          </div>

          <h2
            style={{
              color:
                '#dc2626',
            }}
          >
            {unpaidCount} 筆
          </h2>
        </div>
      </div>

      {/* 查詢 */}

      <div
        className="card"
        style={{
          marginTop:
            20,
        }}
      >
        <form
          method="GET"
          style={{
            display:
              'grid',

            gridTemplateColumns:
              'minmax(260px,2fr) minmax(120px,.8fr) minmax(120px,.8fr) auto',

            gap: 12,
            alignItems:
              'end',
          }}
        >
          <div className="field">
            <label>
              搜尋
            </label>

            <input
              type="text"
              name="q"
              defaultValue={
                q
              }
              placeholder="客戶編號、姓名、電話、車牌"
            />
          </div>

          <div className="field">
            <label>
              付款
            </label>

            <select
              name="payment"
              defaultValue={
                payment
              }
            >
              <option value="">
                全部
              </option>

              <option value="paid">
                已繳
              </option>

              <option value="unpaid">
                未繳
              </option>
            </select>
          </div>

          <div className="field">
            <label>
              狀態
            </label>

            <select
              name="status"
              defaultValue={
                status
              }
            >
              <option value="">
                全部
              </option>

              <option value="active">
                使用中
              </option>

              <option value="expired">
                已到期
              </option>

              <option value="cancelled">
                已退租
              </option>
            </select>
          </div>

          <div
            style={{
              display:
                'flex',
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
              href="/dashboard/monthly-rentals"
              style={{
                padding:
                  '9px 14px',
                border:
                  '1px solid #cbd5e1',
                borderRadius:
                  8,
                background:
                  '#fff',
                color:
                  '#475569',
                textDecoration:
                  'none',
              }}
            >
              清除
            </Link>
          </div>
        </form>
      </div>

      {/* 錯誤訊息 */}

      {parkingLotsError && (
        <div
          className="card"
          style={{
            marginTop:
              20,
            color:
              '#dc2626',
          }}
        >
          停車場讀取失敗：
          {
            parkingLotsError.message
          }
        </div>
      )}

      {error && (
        <div
          className="card"
          style={{
            marginTop:
              20,
            color:
              '#dc2626',
          }}
        >
          月租資料讀取失敗：
          {error.message}
        </div>
      )}

      {/* 名單 */}

      <div
        className="card"
        style={{
          marginTop:
            20,
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
              月租名單
            </h2>

            {currentParkingLot && (
              <div
                className="muted"
                style={{
                  marginTop:
                    4,
                }}
              >
                {
                  currentParkingLot.name
                }
              </div>
            )}
          </div>

          <span className="muted">
            共 {totalCount} 筆
          </span>
        </div>

        {!error &&
        (!rentals ||
          rentals.length ===
            0) && (
          <div
            style={{
              padding:
                30,
              textAlign:
                'center',
              color:
                '#64748b',
            }}
          >
            {lot
              ? '目前沒有符合條件的月租資料。'
              : '請先選擇目前工作停車場。'}
          </div>
        )}

        {!error &&
        rentals &&
        rentals.length >
          0 && (
          <div
            style={{
              overflowX:
                'auto',
              marginTop:
                16,
            }}
          >
            <table
              style={{
                width:
                  '100%',
                minWidth:
                  1220,
                borderCollapse:
                  'collapse',
                tableLayout:
                  'fixed',
              }}
            >
              <colgroup>
                <col
                  style={{
                    width:
                      170,
                  }}
                />

                <col
                  style={{
                    width:
                      85,
                  }}
                />

                <col
                  style={{
                    width:
                      85,
                  }}
                />

                <col
                  style={{
                    width:
                      110,
                  }}
                />

                <col
                  style={{
                    width:
                      90,
                  }}
                />

                <col
                  style={{
                    width:
                      55,
                  }}
                />

                <col
                  style={{
                    width:
                      85,
                  }}
                />

                <col
                  style={{
                    width:
                      210,
                  }}
                />

                <col
                  style={{
                    width:
                      75,
                  }}
                />

                <col
                  style={{
                    width:
                      80,
                  }}
                />

                <col
                  style={{
                    width:
                      70,
                  }}
                />

                <col
                  style={{
                    width:
                      200,
                  }}
                />
              </colgroup>

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
                        8,
                    }}
                  >
                    停車場
                  </th>

                  <th
                    style={{
                      padding:
                        8,
                    }}
                  >
                    客戶編號
                  </th>

                  <th
                    style={{
                      padding:
                        8,
                    }}
                  >
                    姓名
                  </th>

                  <th
                    style={{
                      padding:
                        8,
                    }}
                  >
                    電話
                  </th>

                  <th
                    style={{
                      padding:
                        8,
                    }}
                  >
                    車牌
                  </th>

                  <th
                    style={{
                      padding:
                        8,
                    }}
                  >
                    車種
                  </th>

                  <th
                    style={{
                      padding:
                        8,
                    }}
                  >
                    類型
                  </th>

                  <th
                    style={{
                      padding:
                        8,
                    }}
                  >
                    租用期間
                  </th>

                  <th
                    style={{
                      padding:
                        8,
                    }}
                  >
                    金額
                  </th>

                  <th
                    style={{
                      padding:
                        8,
                    }}
                  >
                    付款
                  </th>

                  <th
                    style={{
                      padding:
                        8,
                    }}
                  >
                    狀態
                  </th>

                  <th
                    style={{
                      padding:
                        8,
                    }}
                  >
                    操作
                  </th>
                </tr>
              </thead>

              <tbody>
                {rentals.map(
                  (
                    item: any
                  ) => {
                    const rentalType =
                      cleanRentalType(
                        item.rental_type
                      )

                    const parkingLotInfo =
                      Array.isArray(
                        item.parking_lots
                      )
                        ? item
                            .parking_lots[0] ||
                          null
                        : item.parking_lots ||
                          null

                    return (
                      <tr
                        key={
                          item.id
                        }
                        style={{
                          borderTop:
                            '1px solid #e5e7eb',
                        }}
                      >
                        <td
                          style={{
                            padding:
                              8,
                            overflow:
                              'hidden',
                            textOverflow:
                              'ellipsis',
                          }}
                          title={
                            parkingLotInfo?.name ||
                            ''
                          }
                        >
                          {parkingLotInfo?.name ||
                            '-'}
                        </td>

                        <td
                          style={{
                            padding:
                              8,
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {item.customer_code ||
                            '-'}
                        </td>

                        <td
                          style={{
                            padding:
                              8,
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {item.customer_name ||
                            '-'}
                        </td>

                        <td
                          style={{
                            padding:
                              8,
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {item.phone ||
                            '-'}
                        </td>

                        <td
                          style={{
                            padding:
                              8,
                            whiteSpace:
                              'nowrap',
                            fontWeight:
                              700,
                          }}
                        >
                          {item.vehicle_plate ||
                            '-'}
                        </td>

                        <td
                          style={{
                            padding:
                              8,
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {vehicleTypeText(
                            item.vehicle_type
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              8,
                            whiteSpace:
                              'nowrap',
                            overflow:
                              'hidden',
                            textOverflow:
                              'ellipsis',
                            maxWidth:
                              85,
                          }}
                          title={
                            rentalType
                          }
                        >
                          {
                            rentalType
                          }
                        </td>

                        <td
                          style={{
                            padding:
                              8,
                            whiteSpace:
                              'nowrap',
                            fontSize:
                              13,
                          }}
                        >
                          {formatRentalPeriod(
                            item.start_date,
                            item.end_date
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              8,
                            whiteSpace:
                              'nowrap',
                            fontWeight:
                              700,
                          }}
                        >
                          $
                          {Number(
                            item.monthly_fee ||
                              0
                          ).toLocaleString()}
                        </td>

                        <td
                          style={{
                            padding:
                              8,
                          }}
                        >
                          {item.payment_status ===
                          'paid' ? (
                            <div>
                              <div
                                style={{
                                  color:
                                    '#15803d',
                                  fontWeight:
                                    700,
                                  whiteSpace:
                                    'nowrap',
                                }}
                              >
                                已繳
                              </div>

                              {item.payment_date && (
                                <div
                                  style={{
                                    fontSize:
                                      13,
                                    color:
                                      '#64748b',
                                    marginTop:
                                      3,
                                    whiteSpace:
                                      'nowrap',
                                    fontWeight:
                                      500,
                                  }}
                                >
                                  {
                                    item.payment_date
                                  }
                                </div>
                              )}
                            </div>
                          ) : (
                            <span
                              style={{
                                color:
                                  '#dc2626',
                                fontWeight:
                                  700,
                                whiteSpace:
                                  'nowrap',
                              }}
                            >
                              未繳
                            </span>
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              8,
                            whiteSpace:
                              'nowrap',
                            fontSize:
                              13,
                          }}
                        >
                          {rentalStatusText(
                            item.rental_status
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              8,
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          <MonthlyRentalActions
                            rental={
                              item
                            }
                          />
                        </td>
                      </tr>
                    )
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}