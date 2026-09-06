import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import MonthlyRentalActions from '@/components/MonthlyRentalActions'
import MonthlyRentalDeleteButton from '@/components/MonthlyRentalDeleteButton'
import ExcelExportButton from '@/components/ExcelExportButton'
import CsvImportButton from '@/components/CsvImportButton'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import ui from '@/components/PlatformAdmin.module.css'

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


function monthKey(value?: string | null) {
  return value ? String(value).slice(0, 7) : ''
}

function formatPaidMonths(months: string[]) {
  const unique = Array.from(new Set(months.map(monthKey).filter(Boolean))).sort()
  if (unique.length === 0) return '-'

  const groups: string[][] = []
  for (const item of unique) {
    const lastGroup = groups[groups.length - 1]
    if (!lastGroup) {
      groups.push([item])
      continue
    }
    const last = lastGroup[lastGroup.length - 1]
    const [ly, lm] = last.split('-').map(Number)
    const [cy, cm] = item.split('-').map(Number)
    const nextY = lm === 12 ? ly + 1 : ly
    const nextM = lm === 12 ? 1 : lm + 1
    if (cy === nextY && cm === nextM) lastGroup.push(item)
    else groups.push([item])
  }

  return groups.map((group) => {
    const first = group[0].replace('-', '/')
    if (group.length === 1) return first
    const last = group[group.length - 1]
    const firstYear = group[0].slice(0, 4)
    const lastText = last.startsWith(firstYear + '-') ? last.slice(5) : last.replace('-', '/')
    return `${first}～${lastText}`
  }).join('、')
}

function latestPaymentMonth(months: string[]) {
  const unique = Array.from(new Set(months.map(monthKey).filter(Boolean))).sort()
  const latest = unique[unique.length - 1] || ''
  return latest ? latest.replace('-', '/') : '-'
}


function findNextPaymentMonth(
  startDate?: string | null,
  endDate?: string | null,
  paidMonths: string[] = [],
  legacyPaidWithoutMonths = false
) {
  if (!startDate || !endDate) return '-'
  if (legacyPaidWithoutMonths && paidMonths.length === 0) return '待補繳費月份'

  const paid = new Set(paidMonths.map(monthKey))
  let [year, month] = monthKey(startDate).split('-').map(Number)
  const [endYear, endMonth] = monthKey(endDate).split('-').map(Number)

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const key = `${year}-${String(month).padStart(2, '0')}`
    if (!paid.has(key)) return key.replace('-', '/')
    month += 1
    if (month > 12) { month = 1; year += 1 }
  }
  return '本租期已繳清'
}


function fourMonthsAgoDateText() {
  const now = new Date()

  /*
   * 月租總表只保留：
   * - 尚未到期
   * - 或到期未超過 4 個月
   *
   * 例如今天是 2026-09-04，
   * 2026-05-04 之後的到期資料仍會顯示。
   */
  const cutoff = new Date(
    now.getFullYear(),
    now.getMonth() - 4,
    now.getDate()
  )

  const year =
    cutoff.getFullYear()

  const month =
    String(
      cutoff.getMonth() + 1
    ).padStart(2, '0')

  const day =
    String(
      cutoff.getDate()
    ).padStart(2, '0')

  return `${year}-${month}-${day}`
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
   * 全系統目前工作停車場：
   * 由左側 WorkParkingLotSelector 寫入 cookie，
   * 月租管理只跟著這個場站，不再自己另選停車場。
   */
  const lot =
    await getCurrentWorkParkingLotId()

  const payment =
    params.payment || ''

  const status =
    params.status || ''

  const fourMonthsAgo =
    fourMonthsAgoDateText()

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
        rental_term_id,
        data_source,
        rental_term_locked,
        last_paid_month,

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

  /*
   * 月租總表固定排除：
   * 1. 已退租資料
   * 2. 到期超過 4 個月的舊資料
   *
   * 原始資料不刪除，退租歷史仍保留在
   * monthly_rental_changes / 簽約異動。
   */
  query =
    query
      .neq(
        'rental_status',
        'cancelled'
      )
      .or(
        `end_date.is.null,end_date.gte.${fourMonthsAgo}`
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

  const effectiveLotId =
    lot ||
    '00000000-0000-0000-0000-000000000000'

  const { data: activeRentalTerm } = lot
    ? await supabase
        .from('parking_lot_rental_terms')
        .select('id,term_name,start_date,end_date')
        .eq('parking_lot_id', lot)
        .eq('is_active', true)
        .maybeSingle()
    : { data: null as any }

  query =
    query.eq(
      'parking_lot_id',
      effectiveLotId
    )

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

  const rentalIds = (rentals || []).map((item: any) => item.id)
  let paymentMonths: any[] = []

  if (rentalIds.length > 0) {
    const { data: monthRows, error: monthError } = await supabase
      .from('monthly_rental_payment_months')
      .select('monthly_rental_id,coverage_month,payment_date,invoice_number,amount,source')
      .in('monthly_rental_id', rentalIds)
      .order('coverage_month', { ascending: true })

    if (!monthError) paymentMonths = monthRows || []
  }

  const paymentMonthMap = new Map<string, string[]>()
  for (const row of paymentMonths) {
    const list = paymentMonthMap.get(row.monthly_rental_id) || []
    list.push(row.coverage_month)
    paymentMonthMap.set(row.monthly_rental_id, list)
  }

  /*
   * Supabase 回傳資料具有推導型別，不能直接在原物件上動態新增
   * _paid_months 等顯示用欄位，否則 Next.js build 會出現：
   * Property '_paid_months' does not exist ...
   *
   * 因此改成建立新的畫面資料，不修改 Supabase 原始結果。
   */
  const enrichedRentals: any[] = (rentals || []).map((item: any) => {
    const paidMonths = paymentMonthMap.get(item.id) || []

    return {
      ...item,
      _paid_months: paidMonths,
      _paid_months_text: formatPaidMonths(paidMonths),
      _payment_month: latestPaymentMonth(paidMonths),
      _next_payment_month: findNextPaymentMonth(
        item.start_date,
        item.end_date,
        paidMonths,
        item.payment_status === 'paid'
      ),
    }
  })

  const totalCount =
    enrichedRentals.length

  const paidCount =
    enrichedRentals.filter(
      (item: any) =>
        (item._paid_months?.length || 0) > 0 || item.payment_status === 'paid'
    ).length

  const unpaidCount =
    enrichedRentals.filter(
      (item: any) =>
        item._next_payment_month !== '本租期已繳清'
    ).length

  const activeCount =
    enrichedRentals.filter(
      (item: any) =>
        item.rental_status ===
        'active'
    ).length

  const exportRows =
    enrichedRentals.map(
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
          activeRentalTerm?.start_date ||
          '',

        end_date:
          activeRentalTerm?.end_date ||
          '',

        payment_month:
          item._payment_month ||
          '-',

        data_source:
          item.data_source ||
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
    <div className={ui.monthlyPage}>
      {/* 標題 */}

      <div
        style={{
          display: 'flex',
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
            管理各停車場月租戶。名單中的正式租期直接依主管目前租期設定顯示，繳費只顯示最近一個繳費月份；完整繳費歷史仍保留在「繳費紀錄」。已退租與到期超過 4 個月的資料不顯示於總表。
          </p>
        </div>

        <div
          style={{
            display: 'flex',
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
                ? `/dashboard/monthly-rentals/import-legacy?lot=${encodeURIComponent(lot)}`
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
            }}
          >
            匯入舊系統總表
          </Link>

          {profile.role === 'supervisor' && (
            <>
              <Link
                href="/dashboard/monthly-rentals/rental-terms"
                style={{ padding: '9px 14px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#334155', textDecoration: 'none', fontWeight: 600 }}
              >
                租期設定
              </Link>
              <Link
                href="/dashboard/monthly-rentals/legacy-new"
                style={{ padding: '9px 14px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#334155', textDecoration: 'none', fontWeight: 600 }}
              >
                ＋新增舊資料
              </Link>
            </>
          )}

          <CsvImportButton
            parkingLots={
              parkingLotOptions
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
            rows={exportRows}
          />

          <Link
            href={
              lot
                ? `/dashboard/monthly-rentals/new?parking_lot_id=${encodeURIComponent(lot)}`
                : '/dashboard/monthly-rentals/new'
            }
            className="btn"
            style={{
              textDecoration:
                'none',
            }}
          >
            ＋新增月租
          </Link>
        </div>
      </div>
      <div
        className="card"
        style={{
          marginTop: 20,
          padding: 16,
          background: '#f8fafc',
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: '#64748b',
            marginBottom: 4,
          }}
        >
          目前工作停車場
        </div>

        <strong
          style={{
            fontSize: 18,
          }}
        >
          {parkingLotOptions.find(
            (item: any) =>
              item.id === lot
          )?.name ||
            '尚未選擇工作停車場'}
        </strong>

        {lot && (
          <div style={{ marginTop: 8, fontSize: 13, color: activeRentalTerm ? '#166534' : '#b45309' }}>
            {activeRentalTerm
              ? `目前正式租期：${activeRentalTerm.term_name}｜${activeRentalTerm.start_date} ～ ${activeRentalTerm.end_date}`
              : '尚未設定目前正式租期；主管可到「租期設定」建立抽籤／年度期別。'}
          </div>
        )}

        {!lot && (
          <div
            style={{
              marginTop: 8,
              color: '#dc2626',
              fontSize: 13,
            }}
          >
            請先從左側「目前工作停車場」選擇場站。
          </div>
        )}
      </div>

      {/* 統計 */}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(4, minmax(150px, 1fr))',
          gap: 14,
          marginTop: 22,
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
            有繳費紀錄
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
            尚有應繳月份
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
          marginTop: 20,
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
              最近收款
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
              href={
                '/dashboard/monthly-rentals'
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
          }}
        >
          <h2
            style={{
              margin: 0,
            }}
          >
            月租名單
          </h2>

          <span className="muted">
            共 {totalCount} 筆
          </span>
        </div>

        {!error &&
        (!enrichedRentals ||
          enrichedRentals.length ===
            0) && (
          <div
            style={{
              padding: 30,
              textAlign:
                'center',
              color:
                '#64748b',
            }}
          >
            目前沒有符合條件的月租資料。
          </div>
        )}

        {!error &&
        enrichedRentals &&
        enrichedRentals.length >
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
                  1320,
                borderCollapse:
                  'collapse',

                /*
                 * 固定欄寬，
                 * 避免類型欄把整張表撐開
                 */
                tableLayout:
                  'fixed',
              }}
            >
              <colgroup>
                <col
                  style={{
                    width: 170,
                  }}
                />

                <col
                  style={{
                    width: 85,
                  }}
                />

                <col
                  style={{
                    width: 85,
                  }}
                />

                <col
                  style={{
                    width: 110,
                  }}
                />

                <col
                  style={{
                    width: 90,
                  }}
                />

                <col
                  style={{
                    width: 55,
                  }}
                />

                {/* 類型 */}
                <col
                  style={{
                    width: 85,
                  }}
                />

                {/* 正式租期 */}
                <col style={{ width: 210 }} />
                {/* 繳費月份 */}
                <col style={{ width: 110 }} />

                <col
                  style={{
                    width: 75,
                  }}
                />

                <col
                  style={{
                    width: 80,
                  }}
                />

                <col
                  style={{
                    width: 70,
                  }}
                />

                <col
                  style={{
                    width: 200,
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

                  <th style={{ padding: 8 }}>
                    正式租期
                  </th>

                  <th style={{ padding: 8 }}>繳費月份</th>

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
                {enrichedRentals.map(
                  (item: any) => {
                    const rentalType =
                      cleanRentalType(
                        item.rental_type
                      )

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
                            item
                              .parking_lots
                              ?.name ||
                            ''
                          }
                        >
                          {item
                            .parking_lots
                            ?.name ||
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

                        {/* 類型 */}

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

                        {/* 正式租期：直接依主管目前租期設定顯示 */}

                        <td
                          style={{
                            padding:
                              8,
                            whiteSpace:
                              'nowrap',
                            fontSize:
                              13,
                          }}
                          title={activeRentalTerm?.term_name || ''}
                        >
                          {activeRentalTerm
                            ? formatRentalPeriod(
                                activeRentalTerm.start_date,
                                activeRentalTerm.end_date
                              )
                            : '未設定'}
                        </td>

                        {/* 月租名單只顯示最近一個繳費月份；完整歷史留在繳費紀錄 */}
                        <td style={{ padding: 8, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {item._payment_month !== '-'
                            ? item._payment_month
                            : item.payment_status === 'paid'
                              ? '未指定'
                              : '-'}
                        </td>

                        {/* 金額 */}

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

                        {/* 付款 */}

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
      fontSize: 13,
      color: '#64748b',
      marginTop: 3,
      whiteSpace: 'nowrap',
      fontWeight: 500,
    }}
  >
    {item.payment_date}
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

                        {/* 狀態 */}

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

                        {/* 操作 */}

                        <td
                          style={{
                            padding:
                              8,
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          <MonthlyRentalActions
                            rental={item}
                            canManageTerm={profile.role === 'supervisor'}
                          />

                          <MonthlyRentalDeleteButton
                            rental={item}
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