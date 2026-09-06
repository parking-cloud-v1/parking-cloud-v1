import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DisasterBatchDownloadControl from '@/components/DisasterBatchDownloadControl'

type DisasterInspection = {
  id: string
  parking_lot_id: string
  event_type: 'typhoon' | 'heavy_rain'
  lot_type: string | null
  inspector_name: string
  inspection_date: string
  status: 'draft' | 'completed'
  created_at: string
  parking_lots?: {
    name: string
  } | null
}

function eventTypeText(
  value: string
) {
  return value ===
    'heavy_rain'
    ? '豪、大雨'
    : '颱風前'
}

function statusText(
  value: string
) {
  return value ===
    'completed'
    ? '已完成'
    : '草稿'
}

export default async function DisasterInspectionsPage() {
  const supabase =
    await createClient()

  const {
    data: { user },
  } =
    await supabase
      .auth
      .getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } =
    await supabase
      .from('profiles')
      .select('role,is_active')
      .eq('id', user.id)
      .maybeSingle()

  if (!profile?.is_active) {
    redirect('/login')
  }

  const isSupervisor =
    profile.role === 'supervisor'

  const {
    data,
    error,
  } =
    await supabase
      .from(
        'disaster_inspections'
      )
      .select(`
        id,
        parking_lot_id,
        event_type,
        lot_type,
        inspector_name,
        inspection_date,
        status,
        created_at,
        parking_lots (
          name
        )
      `)
      .order(
        'inspection_date',
        {
          ascending:
            false,
        }
      )
      .order(
        'created_at',
        {
          ascending:
            false,
        }
      )

  const inspections =
    (data || []).map((item: any) => ({
      ...item,
      parking_lots: Array.isArray(item.parking_lots)
        ? item.parking_lots[0] || null
        : item.parking_lots || null,
    })) as DisasterInspection[]

  const dateCountMap =
    new Map<string, number>()

  inspections.forEach((item) => {
    dateCountMap.set(
      item.inspection_date,
      (dateCountMap.get(
        item.inspection_date
      ) || 0) + 1
    )
  })

  const dateCounts =
    Array.from(
      dateCountMap.entries()
    )
      .map(([date, count]) => ({
        date,
        count,
      }))
      .sort((a, b) =>
        b.date.localeCompare(a.date)
      )

  return (
    <div
      style={{
        paddingBottom:
          40,
      }}
    >
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
              marginTop: 0,
              marginBottom: 6,
            }}
          >
            防災檢查
          </h1>

          <p
            className="muted"
            style={{
              margin: 0,
            }}
          >
            新北市政府交通局颱風前（或豪、大雨）整備工作自主檢查表
          </p>
        {isSupervisor && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 11px',
              borderRadius: 9,
              background: '#eff6ff',
              color: '#1d4ed8',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            主管可依日期一次下載當日所有停車場的防災檢查，系統會合併成 1 個 PDF。
          </div>
        )}
        </div>

        <Link
          href="/dashboard/disaster-inspections/new"
          className="btn"
          style={{
            textDecoration:
              'none',
          }}
        >
          ＋ 新增自主檢查表
        </Link>
      </div>

      {isSupervisor && (
        <DisasterBatchDownloadControl
          dateCounts={dateCounts}
        />
      )}

      {error && (
        <div
          style={{
            marginTop: 20,
            padding: 12,
            borderRadius: 8,
            background:
              '#fee2e2',
            color:
              '#b91c1c',
          }}
        >
          防災檢查資料讀取失敗：
          {error.message}
        </div>
      )}

      <div
        className="card"
        style={{
          marginTop: 20,
        }}
      >
        {!inspections.length ? (
          <div
            style={{
              padding: 20,
              color:
                '#64748b',
            }}
          >
            目前尚無防災自主檢查紀錄。
          </div>
        ) : (
          <div
            style={{
              overflowX:
                'auto',
            }}
          >
            <table
              style={{
                width:
                  '100%',
                minWidth:
                  980,
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
                  <th>
                    檢查日期
                  </th>

                  <th>
                    停車場
                  </th>

                  <th>
                    防災類型
                  </th>

                  <th>
                    停車場型式
                  </th>

                  <th>
                    檢查人員
                  </th>

                  <th>
                    狀態
                  </th>

                  <th>
                    操作
                  </th>
                </tr>
              </thead>

              <tbody>
                {inspections.map(
                  (
                    item
                  ) => (
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
                            10,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {
                          item.inspection_date
                        }
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                          minWidth:
                            220,
                          fontWeight:
                            700,
                        }}
                      >
                        {item.parking_lots
                          ?.name ||
                          '-'}
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                        }}
                      >
                        {eventTypeText(
                          item.event_type
                        )}
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                        }}
                      >
                        {item.lot_type ||
                          '-'}
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                        }}
                      >
                        {
                          item.inspector_name
                        }
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                          fontWeight:
                            700,
                          color:
                            item.status ===
                            'completed'
                              ? '#15803d'
                              : '#d97706',
                        }}
                      >
                        {statusText(
                          item.status
                        )}
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            gap: 10,
                            alignItems: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          <Link
                            href={`/dashboard/disaster-inspections/${item.id}`}
                            style={{
                              color: '#2563eb',
                              textDecoration: 'none',
                              fontWeight: 700,
                            }}
                          >
                            查看／編輯
                          </Link>

                          {isSupervisor && (
                            <Link
                              href={`/dashboard/disaster-inspections/${item.id}?download=1`}
                              style={{
                                padding: '6px 9px',
                                borderRadius: 7,
                                background: '#0f172a',
                                color: '#fff',
                                textDecoration: 'none',
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              一鍵下載 PDF
                            </Link>
                          )}
                        </div>
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
