import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

function sourceText(source?: string | null) {
  if (source === 'manual') {
    return '手動收款'
  }

  if (source === 'payment_csv') {
    return '繳費報表'
  }

  if (source === 'renewal') {
    return '續租'
  }

  if (source === 'system') {
    return '系統'
  }

  return source || '-'
}

function money(value?: number | string | null) {
  const amount = Number(value || 0)

  return `$${amount.toLocaleString()}`
}

function rentalPeriod(
  start?: string | null,
  end?: string | null
) {
  if (!start && !end) {
    return '-'
  }

  return `${start || '-'} 到 ${end || '-'}`
}

export default async function MonthlyPaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string
    lot?: string
    from?: string
    to?: string
    source?: string
  }>
}) {
  const supabase = await createClient()

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

  const params = searchParams
    ? await searchParams
    : {}

  const q = params.q || ''
  const lot = params.lot || ''
  const from = params.from || ''
  const to = params.to || ''
  const source = params.source || ''

  const { data: parkingLots } = await supabase
    .from('parking_lots')
    .select('id, name')
    .eq('status', 'active')
    .order('name')

  let query = supabase
    .from('monthly_payments')
    .select(`
      id,
      parking_lot_id,
      monthly_rental_id,
      customer_code,
      customer_name,
      phone,
      vehicle_plate,
      payment_date,
      amount,
      payment_method,
      invoice_number,
      rental_start_date,
      rental_end_date,
      source,
      source_reference,
      notes,
      created_at,
      parking_lots (
        id,
        name
      )
    `)
    .order('payment_date', {
      ascending: false,
    })
    .order('created_at', {
      ascending: false,
    })

  if (lot) {
    query = query.eq(
      'parking_lot_id',
      lot
    )
  }

  if (from) {
    query = query.gte(
      'payment_date',
      from
    )
  }

  if (to) {
    query = query.lte(
      'payment_date',
      to
    )
  }

  if (source) {
    query = query.eq(
      'source',
      source
    )
  }

  if (q.trim()) {
    query = query.or(
      [
        `customer_code.ilike.%${q.trim()}%`,
        `customer_name.ilike.%${q.trim()}%`,
        `phone.ilike.%${q.trim()}%`,
        `vehicle_plate.ilike.%${q.trim()}%`,
        `invoice_number.ilike.%${q.trim()}%`,
      ].join(',')
    )
  }

  const {
    data: payments,
    error,
  } = await query

  const totalCount =
    payments?.length || 0

  const totalAmount =
    payments?.reduce(
      (sum: number, item: any) =>
        sum + Number(item.amount || 0),
      0
    ) || 0

  const csvCount =
    payments?.filter(
      (item: any) =>
        item.source === 'payment_csv'
    ).length || 0

  const manualCount =
    payments?.filter(
      (item: any) =>
        item.source === 'manual'
    ).length || 0

  return (
    <div>
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
            月租繳費紀錄
          </h1>

          <p
            className="muted"
            style={{
              marginTop: 0,
            }}
          >
            查詢每一筆月租收款紀錄，不會因下次續租或繳費而覆蓋。
          </p>
        </div>

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
          ← 返回月租管理
        </Link>
      </div>

      {/* 查詢條件 */}
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
          <div className="field">
            <label>
              關鍵字
            </label>

            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="姓名、車牌、客戶編號、發票"
            />
          </div>

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

          <div className="field">
            <label>
              來源
            </label>

            <select
              name="source"
              defaultValue={source}
            >
              <option value="">
                全部來源
              </option>

              <option value="manual">
                手動收款
              </option>

              <option value="payment_csv">
                繳費報表
              </option>

              <option value="renewal">
                續租
              </option>

              <option value="system">
                系統
              </option>
            </select>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="submit"
              className="btn"
            >
              查詢
            </button>

            <Link
              href="/dashboard/monthly-rentals/payments"
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

      {/* 統計 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(4, minmax(160px, 1fr))',
          gap: 14,
          marginTop: 20,
          overflowX: 'auto',
        }}
      >
        <div className="card">
          <div className="muted">
            查詢筆數
          </div>

          <h2
            style={{
              marginBottom: 0,
            }}
          >
            {totalCount} 筆
          </h2>
        </div>

        <div className="card">
          <div className="muted">
            收款總額
          </div>

          <h2
            style={{
              marginBottom: 0,
            }}
          >
            {money(totalAmount)}
          </h2>
        </div>

        <div className="card">
          <div className="muted">
            繳費報表
          </div>

          <h2
            style={{
              marginBottom: 0,
            }}
          >
            {csvCount} 筆
          </h2>
        </div>

        <div className="card">
          <div className="muted">
            手動收款
          </div>

          <h2
            style={{
              marginBottom: 0,
            }}
          >
            {manualCount} 筆
          </h2>
        </div>
      </div>

      {/* 表格 */}
      <div
        className="card"
        style={{
          marginTop: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <h2
            style={{
              margin: 0,
            }}
          >
            繳費明細
          </h2>

          <span className="muted">
            共 {totalCount} 筆
          </span>
        </div>

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background:
                '#fef2f2',
              color: '#dc2626',
              borderRadius: 8,
            }}
          >
            讀取失敗：
            {error.message}
          </div>
        )}

        {!error &&
        (!payments ||
          payments.length === 0) && (
          <div
            style={{
              padding: 28,
              textAlign: 'center',
              color: '#64748b',
            }}
          >
            目前還沒有繳費歷史。
          </div>
        )}

        {!error &&
        payments &&
        payments.length > 0 && (
          <div
            style={{
              overflowX: 'auto',
              marginTop: 16,
            }}
          >
            <table
              style={{
                width: '100%',
                minWidth: 1450,
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
                  <th style={{ padding: 10 }}>
                    繳費日期
                  </th>

                  <th style={{ padding: 10 }}>
                    停車場
                  </th>

                  <th style={{ padding: 10 }}>
                    客戶編號
                  </th>

                  <th style={{ padding: 10 }}>
                    姓名
                  </th>

                  <th style={{ padding: 10 }}>
                    電話
                  </th>

                  <th style={{ padding: 10 }}>
                    車牌
                  </th>

                  <th style={{ padding: 10 }}>
                    金額
                  </th>

                  <th style={{ padding: 10 }}>
                    付款方式
                  </th>

                  <th style={{ padding: 10 }}>
                    發票號碼
                  </th>

                  <th style={{ padding: 10 }}>
                    租用期間
                  </th>

                  <th style={{ padding: 10 }}>
                    來源
                  </th>

                  <th style={{ padding: 10 }}>
                    備註
                  </th>
                </tr>
              </thead>

              <tbody>
                {payments.map(
                  (item: any) => (
                    <tr
                      key={item.id}
                      style={{
                        borderTop:
                          '1px solid #e5e7eb',
                      }}
                    >
                      <td
                        style={{
                          padding: 10,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {item.payment_date ||
                          '-'}
                      </td>

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

                      <td
                        style={{
                          padding: 10,
                          whiteSpace:
                            'nowrap',
                          fontWeight: 700,
                        }}
                      >
                        {money(
                          item.amount
                        )}
                      </td>

                      <td
                        style={{
                          padding: 10,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {item.payment_method ||
                          '-'}
                      </td>

                      <td
                        style={{
                          padding: 10,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {item.invoice_number ||
                          '-'}
                      </td>

                      <td
                        style={{
                          padding: 10,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {rentalPeriod(
                          item.rental_start_date,
                          item.rental_end_date
                        )}
                      </td>

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

                      <td
                        style={{
                          padding: 10,
                          minWidth: 180,
                        }}
                      >
                        {item.notes ||
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