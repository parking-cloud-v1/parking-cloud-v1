import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { getCurrentWorkParkingLotId } from '@/lib/current-work-parking-lot'

export default async function ShiftClosingPage({
  searchParams,
}: {
  searchParams?: Promise<{
    date?: string
    remittance?: string
  }>
}) {
  const supabase =
    await createClient()

  const {
    data: {
      user,
    },
  } =
    await supabase
      .auth
      .getUser()

  if (
    !user
  ) {
    redirect(
      '/login'
    )
  }

  const params =
    searchParams
      ? await searchParams
      : {}

  const workLotId =
    await getCurrentWorkParkingLotId()

  const date =
    params.date ||
    ''

  const remittance =
    params.remittance ||
    ''

  const {
    data:
      currentLot,
  } =
    workLotId
      ? await supabase
          .from(
            'parking_lots'
          )
          .select(
            'id, name'
          )
          .eq(
            'id',
            workLotId
          )
          .maybeSingle()
      : {
          data:
            null,
        }

  let query =
    supabase
      .from(
        'shift_closing_reports'
      )
      .select(`
        id,
        parking_lot_id,
        closing_date,
        closing_status,
        amount_paid,
        remittance_total,
        remittance_status,
        remitted_at,
        operator_name,
        parking_lots (
          id,
          name
        )
      `)
      .order(
        'closing_date',
        {
          ascending:
            false,
        }
      )

  if (
    workLotId
  ) {
    query =
      query.eq(
        'parking_lot_id',
        workLotId
      )
  } else {
    query =
      query.eq(
        'parking_lot_id',
        '__no_work_lot_selected__'
      )
  }

  if (
    date
  ) {
    query =
      query.eq(
        'closing_date',
        date
      )
  }

  if (
    remittance
  ) {
    query =
      query.eq(
        'remittance_status',
        remittance
      )
  }

  const {
    data:
      reports,
    error,
  } =
    await query

  return (
    <div>
      <div
        style={{
          display:
            'flex',
          justifyContent:
            'space-between',
          gap:
            12,
          flexWrap:
            'wrap',
        }}
      >
        <div>
          <h1>
            當日結班報表
          </h1>

          <div
            className="muted"
          >
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
            textDecoration:
              'none',
            pointerEvents:
              workLotId
                ? 'auto'
                : 'none',
            opacity:
              workLotId
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
            marginTop:
              20,
            color:
              '#b45309',
            fontWeight:
              700,
          }}
        >
          請先在左側選擇目前工作停車場。
        </div>
      )}

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
              'repeat(auto-fit,minmax(180px,1fr))',
            gap:
              12,
          }}
        >
          <div className="field">
            <label>
              結班日期
            </label>

            <input
              type="date"
              name="date"
              defaultValue={
                date
              }
            />
          </div>

          <div className="field">
            <label>
              匯款狀態
            </label>

            <select
              name="remittance"
              defaultValue={
                remittance
              }
            >
              <option value="">
                全部
              </option>

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
              display:
                'flex',
              gap:
                8,
              alignItems:
                'end',
            }}
          >
            <button
              type="submit"
              className="btn"
            >
              查詢
            </button>

            <Link
              href="/dashboard/shift-closing"
            >
              清除
            </Link>
          </div>
        </form>
      </div>

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
          結班資料讀取失敗：
          {error.message}
        </div>
      )}

      <div
        className="card"
        style={{
          marginTop:
            20,
          overflowX:
            'auto',
        }}
      >
        <h2>
          結班紀錄
        </h2>

        <table
          className="table"
          style={{
            minWidth:
              900,
          }}
        >
          <thead>
            <tr>
              <th>
                停車場
              </th>

              <th>
                結班日期
              </th>

              <th>
                結班狀態
              </th>

              <th>
                匯款狀態
              </th>

              <th>
                實收
              </th>

              <th>
                匯款總金額
              </th>

              <th>
                值班人員
              </th>

              <th>
                操作
              </th>
            </tr>
          </thead>

          <tbody>
            {(reports ||
              []).map(
              (
                item: any
              ) => {
                const lot =
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
                  >
                    <td>
                      {lot?.name ||
                        '-'}
                    </td>

                    <td>
                      {
                        item.closing_date
                      }
                    </td>

                    <td>
                      {item.closing_status ===
                      'abnormal'
                        ? '異常'
                        : '正常'}
                    </td>

                    <td>
                      {item.remittance_status ===
                      'remitted'
                        ? '已匯款'
                        : '累積中'}
                    </td>

                    <td>
                      NT${' '}
                      {Number(
                        item.amount_paid ||
                          0
                      ).toLocaleString()}
                    </td>

                    <td>
                      NT${' '}
                      {Number(
                        item.remittance_total ||
                          0
                      ).toLocaleString()}
                    </td>

                    <td>
                      {item.operator_name ||
                        '-'}
                    </td>

                    <td>
                      <Link
                        href={`/dashboard/shift-closing/${item.id}/edit`}
                      >
                        {item.remittance_status ===
                        'remitted'
                          ? '查看'
                          : '編輯'}
                      </Link>
                    </td>
                  </tr>
                )
              }
            )}

            {(!reports ||
              reports.length ===
                0) && (
              <tr>
                <td
                  colSpan={
                    8
                  }
                  style={{
                    textAlign:
                      'center',
                    padding:
                      25,
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