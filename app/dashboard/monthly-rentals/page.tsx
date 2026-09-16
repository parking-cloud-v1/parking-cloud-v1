import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import MonthlyRentalActions from '@/components/MonthlyRentalActions'
import MonthlyRentalDeleteButton from '@/components/MonthlyRentalDeleteButton'
import ExcelExportButton from '@/components/ExcelExportButton'
import CsvImportButton from '@/components/CsvImportButton'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'
import {
  getMonthlyBillingState,
} from '@/lib/monthly-rental-cycle'
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
        system_term_id,
        system_cycle_start_date,
        system_cycle_end_date,
        paid_through_date,
        payment_review_status,

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
   * 新架構只排除已退租資料。
   * 舊月票總表的到期日不再參與月租總表顯示條件。
   */
  query =
    query
      .neq(
        'rental_status',
        'cancelled'
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

  /*
   * 不再讀取舊系統推算的繳費月份表。
   * 舊系統推算的月份與任何歷史 payment-month 資料都不能影響本頁。
   * 畫面只依本系統 paid_through_date + 15 天提醒窗判斷。
   */

  const todayText = new Date().toISOString().slice(0, 10)

  /*
   * 月租總表必須顯示所有未退租月租戶。
   * 3 個月逾期規則只用於操作／簡訊名單，不可把 active 月租戶從總表隱藏。
   */
  const enrichedRentals: any[] = (rentals || [])
    .map((item: any) => {
      const billing = getMonthlyBillingState({
        today: todayText,
        paidThroughDate: item.paid_through_date,
        paymentReviewStatus: item.payment_review_status,
        reminderDays: 15,
      })

      return {
        ...item,
        _stored_payment_status: item.payment_status,
        payment_status: billing.status,
        _billing_state: billing,
      }
    })

  const displayRentals = payment
    ? enrichedRentals.filter((item: any) => item.payment_status === payment)
    : enrichedRentals

  const totalCount =
    displayRentals.length

  /*
   * 畫面續租狀態完全由 paid_through_date + 15 天提醒窗推導。
   * stored payment_status 只保留舊資料相容，不再是權威判斷來源。
   */
  const paidCount =
    displayRentals.filter(
      (item: any) =>
        item.payment_status === 'paid'
    ).length

  const unpaidCount =
    displayRentals.filter(
      (item: any) =>
        item.payment_status === 'unpaid'
    ).length

  const pendingCount =
    displayRentals.filter(
      (item: any) =>
        item.payment_status === 'pending'
    ).length

  const activeCount =
    displayRentals.filter(
      (item: any) =>
        item.rental_status ===
        'active'
    ).length

  const exportRows =
    displayRentals.map(
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
          item.system_cycle_start_date ||
          activeRentalTerm?.start_date ||
          '',

        end_date:
          item.paid_through_date ||
          '',

        paid_through_date:
          item.paid_through_date ||
          '',

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
            管理各停車場月租戶。付款與續租狀態只看本系統正式租期與正式繳費報表；舊月票總表的開始日、結束日、金額與付款欄位不再影響本頁。到期前 15 天會自動顯示未繳。完整繳費歷史保留在「繳費紀錄」；已退租資料不顯示於目前月租總表。
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
              </>
          )}

          {profile.role ===
            'supervisor' && (
            <Link
              href="/dashboard/settings/monthly-rental-types"
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
              月租類型設定
            </Link>
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
            href="/dashboard/monthly-rentals/payment-reviews"
            style={{
              padding: '9px 14px',
              border: '1px solid #f59e0b',
              borderRadius: 8,
              background: '#fffbeb',
              color: '#92400e',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            付款待確認
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
            'repeat(5, minmax(140px, 1fr))',
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
            本期已繳
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
            本期未繳
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


        <div className="card">
          <div
            style={{
              color: '#b45309',
              fontWeight: 700,
            }}
          >
            付款待確認
          </div>

          <h2 style={{ color: '#b45309' }}>
            {pendingCount} 筆
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
              續租狀態
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

              <option value="pending">
                待確認
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
                {/* PHASE44_MONTHLY_RENTAL_READABILITY */}
      <style>{`
        .monthly-rental-readable-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          table-layout: auto;
        }

        .monthly-rental-readable-table thead th {
          font-size: 17px !important;
          font-weight: 800 !important;
          line-height: 1.35 !important;
          padding: 14px 10px !important;
          white-space: nowrap;
          color: #334155;
          background: #f8fafc;
          border-bottom: 2px solid #dbe3ec;
          vertical-align: middle;
        }

        .monthly-rental-readable-table tbody td {
          font-size: 18px !important;
          line-height: 1.55 !important;
          padding: 18px 10px !important;
          vertical-align: middle !important;
          border-bottom: 1px solid #e7edf4;
          color: #0f172a;
        }

        .monthly-rental-readable-table tbody tr {
          background: #ffffff;
        }

        .monthly-rental-readable-table tbody tr:nth-child(even) {
          background: #fbfdff;
        }

        .monthly-rental-readable-table tbody tr:hover {
          background: #f3f7fb;
        }

        .monthly-rental-readable-table tbody td:nth-last-child(1),
        .monthly-rental-readable-table thead th:nth-last-child(1) {
          width: 150px;
          min-width: 150px;
          max-width: 150px;
          text-align: center;
        }

        .monthly-rental-readable-table .monthly-rental-actions {
          display: flex !important;
          flex-wrap: wrap !important;
          justify-content: center !important;
          align-items: center !important;
          gap: 5px !important;
          width: 140px !important;
          margin: 0 auto !important;
        }

        .monthly-rental-readable-table .monthly-rental-actions button {
          font-size: 13px !important;
          font-weight: 700 !important;
          line-height: 1.2 !important;
          padding: 6px 8px !important;
          min-height: 30px !important;
          border-radius: 7px !important;
          width: auto !important;
          min-width: 54px !important;
          white-space: nowrap !important;
          margin: 0 !important;
        }

        @media (max-width: 1200px) {
          .monthly-rental-readable-table thead th {
            font-size: 16px !important;
          }

          .monthly-rental-readable-table tbody td {
            font-size: 17px !important;
          }
        }
      `}</style>
      {/* PHASE45_COLUMN_WIDTH_FIX */}
      <style>{`
        .monthly-rental-readable-table {
          min-width: 1480px !important;
          width: 100% !important;
          table-layout: auto !important;
        }

        .monthly-rental-readable-table th,
        .monthly-rental-readable-table td {
          white-space: nowrap !important;
        }

        .monthly-rental-readable-table th:nth-child(1),
        .monthly-rental-readable-table td:nth-child(1) {
          min-width: 155px !important;
        }

        .monthly-rental-readable-table th:nth-child(2),
        .monthly-rental-readable-table td:nth-child(2) {
          min-width: 82px !important;
        }

        .monthly-rental-readable-table th:nth-child(3),
        .monthly-rental-readable-table td:nth-child(3) {
          min-width: 135px !important;
        }

        .monthly-rental-readable-table th:nth-child(4),
        .monthly-rental-readable-table td:nth-child(4) {
          min-width: 130px !important;
        }

        .monthly-rental-readable-table th:nth-child(5),
        .monthly-rental-readable-table td:nth-child(5) {
          min-width: 100px !important;
        }

        .monthly-rental-readable-table th:nth-child(6),
        .monthly-rental-readable-table td:nth-child(6) {
          min-width: 76px !important;
        }

        .monthly-rental-readable-table th:nth-child(7),
        .monthly-rental-readable-table td:nth-child(7) {
          min-width: 90px !important;
        }

        .monthly-rental-readable-table th:nth-child(8),
        .monthly-rental-readable-table td:nth-child(8) {
          min-width: 115px !important;
        }

        .monthly-rental-readable-table th:nth-child(9),
        .monthly-rental-readable-table td:nth-child(9) {
          min-width: 105px !important;
        }

        .monthly-rental-readable-table th:nth-child(10),
        .monthly-rental-readable-table td:nth-child(10) {
          min-width: 72px !important;
        }

        .monthly-rental-readable-table th:nth-child(11),
        .monthly-rental-readable-table td:nth-child(11) {
          min-width: 78px !important;
        }

        .monthly-rental-readable-table th:nth-child(12),
        .monthly-rental-readable-table td:nth-child(12) {
          width: 138px !important;
          min-width: 138px !important;
          max-width: 138px !important;
        }
      `}</style>
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
        (!displayRentals ||
          displayRentals.length ===
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
        displayRentals &&
        displayRentals.length >
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
                fontSize: 16,
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
             className="monthly-rental-readable-table">
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

                {/* 本系統已繳至日期 */}
                <col style={{ width: 210 }} />

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

                  <th style={{ padding: 8 }}>已繳至</th>

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
                {displayRentals.map(
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

                        {/* 正式到期日只看本系統 paid_through_date；舊月票日期不參與。 */}
                        <td style={{ padding: 8, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {item.paid_through_date || '尚未建立'}
                          {item.payment_review_status === 'pending' && (
                            <div style={{ color: '#b45309', fontWeight: 600, marginTop: 3 }}>付款待確認</div>
                          )}
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
                          {item.payment_status === 'pending' ? (
                            <span
                              style={{
                                color: '#b45309',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              待確認
                            </span>
                          ) : item.payment_status === 'paid' ? (
                            <div>
                              <div
                                style={{
                                  color: '#15803d',
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
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
                                color: '#dc2626',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
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



