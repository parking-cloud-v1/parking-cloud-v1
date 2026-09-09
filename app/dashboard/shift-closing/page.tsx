import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'

function num(value: unknown) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

export default async function ShiftClosingPage({
  searchParams,
}: {
  searchParams?: Promise<{
    date?: string
    remittance?: string
  }>
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const params = searchParams
    ? await searchParams
    : {}

  const workLotId =
    await getCurrentWorkParkingLotId()

  const date = params.date || ''
  const remittance =
    params.remittance || ''

  const { data: currentLot } =
    workLotId
      ? await supabase
          .from('parking_lots')
          .select('id, name')
          .eq('id', workLotId)
          .maybeSingle()
      : { data: null }

  let query = supabase
    .from('shift_closing_reports')
    .select(`
      id,
      parking_lot_id,
      closing_date,
      shift_end_at,
      closing_status,
      amount_paid,
      remittance_total,
      remittance_status,
      remitted_at,
      remittance_batch_id,
      remittance_batch_total,
      remittance_batch_report_count,
      operator_name,
      parking_lots (
        id,
        name
      )
    `)
    .order('shift_end_at', {
      ascending: false,
    })

  if (workLotId) {
    query = query.eq(
      'parking_lot_id',
      workLotId
    )
  } else {
    query = query.eq(
      'parking_lot_id',
      '__no_work_lot_selected__'
    )
  }

  if (date) {
    query = query.eq(
      'closing_date',
      date
    )
  }

  if (remittance) {
    query = query.eq(
      'remittance_status',
      remittance
    )
  }

  const reportsResult = await query

  const pendingResult = workLotId
    ? await supabase
        .from('shift_closing_reports')
        .select('id, remittance_total')
        .eq('parking_lot_id', workLotId)
        .or(
          'remittance_status.eq.accumulating,remittance_status.is.null'
        )
    : {
        data: [],
        error: null,
      }

  const reports =
    reportsResult.data || []
  const error = reportsResult.error

  const pendingReports =
    pendingResult.data || []

  const pendingTotal =
    pendingReports.reduce(
      (total: number, item: any) =>
        total +
        num(item.remittance_total),
      0
    )

  const pendingCount =
    pendingReports.length

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent:
            'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1>當日結班報表</h1>

          <div className="muted">
            目前工作停車場：
            {currentLot?.name ||
              '尚未選擇'}
          </div>
        </div>

        <Link
          href={
            workLotId
              ? '/dashboard/shift-closing/new'
              : '/dashboard/shift-closing'
          }
          className="btn"
          style={{
            textDecoration: 'none',
            pointerEvents: workLotId
              ? 'auto'
              : 'none',
            opacity: workLotId
              ? 1
              : 0.5,
          }}
        >
          ＋新增當日結班
        </Link>
      </div>

      {!workLotId && (
        <div
          className="card"
          style={{
            marginTop: 20,
            color: '#b45309',
            fontWeight: 700,
          }}
        >
          請先在左側選擇目前工作停車場。
        </div>
      )}

      {workLotId && (
        <div
          className="card"
          style={{
            marginTop: 20,
            border:
              pendingCount > 0
                ? '1px solid #f59e0b'
                : '1px solid #bbf7d0',
            background:
              pendingCount > 0
                ? '#fffbeb'
                : '#f0fdf4',
          }}
        >
          <div
            className="muted"
            style={{
              fontSize: 13,
              marginBottom: 4,
            }}
          >
            跨班未匯款累積
          </div>

          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              color:
                pendingCount > 0
                  ? '#b45309'
                  : '#15803d',
            }}
          >
            NT$ {pendingTotal.toLocaleString()}
          </div>

          <div
            className="muted"
            style={{
              marginTop: 4,
            }}
          >
            {pendingCount > 0
              ? `目前共有 ${pendingCount} 班尚未匯款；下一班會繼續接續累積。`
              : '目前沒有尚未匯款的結班資料。'}
          </div>
        </div>
      )}

      <div
        className="card"
        style={{ marginTop: 20 }}
      >
        <form
          method="GET"
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit,minmax(180px,1fr))',
            gap: 12,
          }}
        >
          <div className="field">
            <label>結班日期</label>
            <input
              type="date"
              name="date"
              defaultValue={date}
            />
          </div>

          <div className="field">
            <label>匯款狀態</label>
            <select
              name="remittance"
              defaultValue={remittance}
            >
              <option value="">全部</option>
              <option value="accumulating">
                累積中
              </option>
              <option value="remitted">
                已匯款
              </option>
            </select>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'end',
            }}
          >
            <button
              type="submit"
              className="btn"
            >
              查詢
            </button>

            <Link href="/dashboard/shift-closing">
              清除
            </Link>
          </div>
        </form>
      </div>

      {error && (
        <div
          className="card"
          style={{
            marginTop: 20,
            color: '#dc2626',
          }}
        >
          結班資料讀取失敗：
          {error.message}
        </div>
      )}

      <div
        className="card"
        style={{
          marginTop: 20,
          overflowX: 'auto',
        }}
      >
        <h2>結班紀錄</h2>

        <table
          className="table"
          style={{ minWidth: 1080 }}
        >
          <thead>
            <tr>
              <th>停車場</th>
              <th>結班日期</th>
              <th>結班狀態</th>
              <th>匯款狀態</th>
              <th>實收</th>
              <th>本班匯款</th>
              <th>待匯／批次總額</th>
              <th>值班人員</th>
              <th>操作</th>
            </tr>
          </thead>

          <tbody>
            {reports.map(
              (item: any) => {
                const lot = Array.isArray(
                  item.parking_lots
                )
                  ? item.parking_lots[0] ||
                    null
                  : item.parking_lots ||
                    null

                const isRemitted =
                  item.remittance_status ===
                  'remitted'

                const cycleAmount =
                  isRemitted
                    ? num(
                        item.remittance_batch_total
                      ) ||
                      num(
                        item.remittance_total
                      )
                    : pendingTotal

                const cycleCount =
                  isRemitted
                    ? num(
                        item.remittance_batch_report_count
                      ) || 1
                    : pendingCount

                return (
                  <tr key={item.id}>
                    <td>
                      {lot?.name || '-'}
                    </td>

                    <td>
                      {item.closing_date}
                    </td>

                    <td>
                      {item.closing_status ===
                      'abnormal'
                        ? '異常'
                        : '正常'}
                    </td>

                    <td>
                      {isRemitted
                        ? '已匯款'
                        : '累積中'}
                    </td>

                    <td>
                      NT${' '}
                      {num(
                        item.amount_paid
                      ).toLocaleString()}
                    </td>

                    <td>
                      NT${' '}
                      {num(
                        item.remittance_total
                      ).toLocaleString()}
                    </td>

                    <td>
                      <strong>
                        NT${' '}
                        {cycleAmount.toLocaleString()}
                      </strong>
                      <div
                        className="muted"
                        style={{
                          fontSize: 12,
                          marginTop: 2,
                        }}
                      >
                        {isRemitted
                          ? `本批 ${cycleCount} 班`
                          : `目前 ${cycleCount} 班待匯`}
                      </div>
                    </td>

                    <td>
                      {item.operator_name ||
                        '-'}
                    </td>

                    <td>
                      <Link
                        href={`/dashboard/shift-closing/${item.id}/edit`}
                      >
                        {isRemitted
                          ? '查看'
                          : '編輯'}
                      </Link>
                    </td>
                  </tr>
                )
              }
            )}

            {reports.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  style={{
                    textAlign: 'center',
                    padding: 25,
                  }}
                >
                  目前沒有結班紀錄
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
