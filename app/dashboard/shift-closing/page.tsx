import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'

function num(value: unknown) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function timeValue(value: unknown) {
  const date = new Date(String(value || ''))
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

type GroupedRow = {
  key: string
  status: 'accumulating' | 'remitted'
  representative: any
  rows: any[]
  startDate: string
  endDate: string
  total: number
  count: number
  remittedAt: string | null
  sortAt: number
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
      shift_start_at,
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

  const reportsResult = await query
  const rawReports = reportsResult.data || []
  const error = reportsResult.error

  const pendingRows = rawReports.filter(
    (item: any) =>
      item.remittance_status !== 'remitted'
  )

  const grouped: GroupedRow[] = []

  if (pendingRows.length > 0) {
    const sorted = [...pendingRows].sort(
      (a: any, b: any) =>
        timeValue(b.shift_end_at) -
        timeValue(a.shift_end_at)
    )

    const dates = pendingRows
      .map((item: any) =>
        String(item.closing_date || '')
      )
      .filter(Boolean)
      .sort()

    grouped.push({
      key: 'pending-current-cycle',
      status: 'accumulating',
      representative: sorted[0],
      rows: pendingRows,
      startDate: dates[0] || '',
      endDate:
        dates[dates.length - 1] || '',
      total: pendingRows.reduce(
        (sum: number, item: any) =>
          sum + num(item.remittance_total),
        0
      ),
      count: pendingRows.length,
      remittedAt: null,
      sortAt: timeValue(
        sorted[0]?.shift_end_at
      ),
    })
  }

  const remittedMap = new Map<
    string,
    any[]
  >()

  for (const item of rawReports) {
    if (
      item.remittance_status !==
      'remitted'
    ) {
      continue
    }

    const key =
      item.remittance_batch_id ||
      `legacy-${item.id}`

    if (!remittedMap.has(key)) {
      remittedMap.set(key, [])
    }

    remittedMap.get(key)!.push(item)
  }

  for (const [key, rows] of remittedMap) {
    const sorted = [...rows].sort(
      (a: any, b: any) =>
        timeValue(b.shift_end_at) -
        timeValue(a.shift_end_at)
    )

    const representative = sorted[0]
    const dates = rows
      .map((item: any) =>
        String(item.closing_date || '')
      )
      .filter(Boolean)
      .sort()

    const batchTotal =
      num(
        representative
          ?.remittance_batch_total
      ) ||
      rows.reduce(
        (sum: number, item: any) =>
          sum + num(item.remittance_total),
        0
      )

    const batchCount =
      num(
        representative
          ?.remittance_batch_report_count
      ) || rows.length

    grouped.push({
      key,
      status: 'remitted',
      representative,
      rows,
      startDate: dates[0] || '',
      endDate:
        dates[dates.length - 1] || '',
      total: batchTotal,
      count: batchCount,
      remittedAt:
        representative?.remitted_at || null,
      sortAt:
        timeValue(
          representative?.remitted_at
        ) ||
        timeValue(
          representative?.shift_end_at
        ),
    })
  }

  const displayRows = grouped
    .filter((group) => {
      if (
        remittance &&
        group.status !== remittance
      ) {
        return false
      }

      if (
        date &&
        !group.rows.some(
          (item: any) =>
            item.closing_date === date
        )
      ) {
        return false
      }

      return true
    })
    .sort((a, b) => b.sortAt - a.sortAt)

  const pendingTotal = pendingRows.reduce(
    (total: number, item: any) =>
      total + num(item.remittance_total),
    0
  )

  const pendingCount = pendingRows.length

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
              ? `目前共有 ${pendingCount} 班尚未匯款；主列表只顯示一筆累積中紀錄，按「編輯」可查看全部明細。`
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
        <h2>匯款週期紀錄</h2>

        <div
          className="muted"
          style={{
            marginBottom: 14,
          }}
        >
          累積中的班別只顯示一列；匯款完成後，每一批只保留一列留底紀錄。每班原始資料仍保留在系統內供明細查詢。
        </div>

        <table
          className="table"
          style={{ minWidth: 980 }}
        >
          <thead>
            <tr>
              <th>停車場</th>
              <th>累積期間</th>
              <th>匯款狀態</th>
              <th>班數</th>
              <th>待匯／批次總額</th>
              <th>匯款完成時間</th>
              <th>操作</th>
            </tr>
          </thead>

          <tbody>
            {displayRows.map((group) => {
              const item =
                group.representative
              const lot = Array.isArray(
                item?.parking_lots
              )
                ? item.parking_lots[0] ||
                  null
                : item?.parking_lots || null

              const period =
                group.startDate &&
                group.endDate &&
                group.startDate !==
                  group.endDate
                  ? `${group.startDate} ～ ${group.endDate}`
                  : group.startDate || '-'

              return (
                <tr key={group.key}>
                  <td>
                    {lot?.name || '-'}
                  </td>

                  <td>{period}</td>

                  <td>
                    <strong
                      style={{
                        color:
                          group.status ===
                          'remitted'
                            ? '#15803d'
                            : '#b45309',
                      }}
                    >
                      {group.status ===
                      'remitted'
                        ? '已匯款'
                        : '累積中'}
                    </strong>
                  </td>

                  <td>
                    {group.count} 班
                  </td>

                  <td>
                    <strong>
                      NT${' '}
                      {group.total.toLocaleString()}
                    </strong>
                  </td>

                  <td>
                    {group.remittedAt
                      ? new Date(
                          group.remittedAt
                        ).toLocaleString(
                          'zh-TW'
                        )
                      : '-'}
                  </td>

                  <td>
                    <Link
                      href={`/dashboard/shift-closing/${item.id}/edit`}
                    >
                      {group.status ===
                      'remitted'
                        ? '查看留底'
                        : '編輯／查看明細'}
                    </Link>
                  </td>
                </tr>
              )
            })}

            {displayRows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
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
