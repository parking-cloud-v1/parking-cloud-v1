'use client'

type ComparisonItem = {
  type:
    | 'joined'
    | 'cancelled'
    | 'updated'
    | 'date_only'

  customer_code?: string
  customer_name?: string
  vehicle_plate?: string
  detail?: string
}

export type LegacyComparisonResult = {
  hasPreviousBatch: boolean

  baselineCount: number

  joinedCount: number
  cancelledCount: number
  updatedCount: number
  dateOnlyCount: number
  unchangedCount: number

  items: ComparisonItem[]
}

function typeText(
  type: ComparisonItem['type']
) {
  if (type === 'joined') {
    return '新加入'
  }

  if (type === 'cancelled') {
    return '退租'
  }

  if (type === 'updated') {
    return '資料異動'
  }

  return '只有租期更新'
}

function typeColor(
  type: ComparisonItem['type']
) {
  if (type === 'joined') {
    return '#15803d'
  }

  if (type === 'cancelled') {
    return '#dc2626'
  }

  if (type === 'updated') {
    return '#d97706'
  }

  return '#64748b'
}

export default function LegacyImportComparison({
  result,
}: {
  result: LegacyComparisonResult | null
}) {
  if (!result) {
    return null
  }

  /*
   * 第一次匯入
   */
  if (!result.hasPreviousBatch) {
    return (
      <div
        className="card"
        style={{
          marginTop: 20,
        }}
      >
        <h2
          style={{
            marginTop: 0,
          }}
        >
          匯入前確認
        </h2>

        <div
          style={{
            padding: 16,
            borderRadius: 10,
            background: '#f8fafc',
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: 18,
            }}
          >
            第一次匯入・建立基準總表
          </div>

          <p
            style={{
              marginBottom: 0,
              color: '#64748b',
            }}
          >
            目前這個停車場沒有上一份正式總表，因此本次
            {result.baselineCount} 筆會作為之後比對的基準，不會全部列入「新加入」。
          </p>
        </div>

        <div
          style={{
            marginTop: 14,
            fontWeight: 700,
          }}
        >
          基準名單：{result.baselineCount} 筆
        </div>
      </div>
    )
  }

  return (
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
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
            }}
          >
            與上一次總表比較
          </h2>

          <p
            className="muted"
            style={{
              marginBottom: 0,
            }}
          >
            以下只是預覽，目前尚未修改正式月租資料。
          </p>
        </div>
      </div>

      {/* 統計 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginTop: 18,
        }}
      >
        <div
          style={{
            padding: 16,
            border: '1px solid #e2e8f0',
            borderRadius: 10,
          }}
        >
          <div
            style={{
              color: '#15803d',
              fontWeight: 700,
            }}
          >
            新加入
          </div>

          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            {result.joinedCount} 筆
          </div>
        </div>

        <div
          style={{
            padding: 16,
            border: '1px solid #e2e8f0',
            borderRadius: 10,
          }}
        >
          <div
            style={{
              color: '#dc2626',
              fontWeight: 700,
            }}
          >
            退租
          </div>

          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            {result.cancelledCount} 筆
          </div>
        </div>

        <div
          style={{
            padding: 16,
            border: '1px solid #e2e8f0',
            borderRadius: 10,
          }}
        >
          <div
            style={{
              color: '#d97706',
              fontWeight: 700,
            }}
          >
            簽約資料異動
          </div>

          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            {result.updatedCount} 筆
          </div>
        </div>

        <div
          style={{
            padding: 16,
            border: '1px solid #e2e8f0',
            borderRadius: 10,
          }}
        >
          <div
            style={{
              color: '#64748b',
              fontWeight: 700,
            }}
          >
            只有租期更新
          </div>

          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            {result.dateOnlyCount} 筆
          </div>
        </div>

        <div
          style={{
            padding: 16,
            border: '1px solid #e2e8f0',
            borderRadius: 10,
          }}
        >
          <div
            style={{
              color: '#64748b',
              fontWeight: 700,
            }}
          >
            完全未變
          </div>

          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            {result.unchangedCount} 筆
          </div>
        </div>
      </div>

      {/* 異動明細 */}
      {result.items.length > 0 && (
        <div
          style={{
            marginTop: 22,
          }}
        >
          <h3>
            異動預覽
          </h3>

          <div
            style={{
              overflowX: 'auto',
            }}
          >
            <table
              style={{
                width: '100%',
                minWidth: 900,
                borderCollapse: 'collapse',
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
                      padding: 9,
                    }}
                  >
                    狀態
                  </th>

                  <th
                    style={{
                      padding: 9,
                    }}
                  >
                    客戶編號
                  </th>

                  <th
                    style={{
                      padding: 9,
                    }}
                  >
                    姓名
                  </th>

                  <th
                    style={{
                      padding: 9,
                    }}
                  >
                    車牌
                  </th>

                  <th
                    style={{
                      padding: 9,
                    }}
                  >
                    內容
                  </th>
                </tr>
              </thead>

              <tbody>
                {result.items
                  .slice(0, 100)
                  .map(
                    (
                      item,
                      index
                    ) => (
                      <tr
                        key={index}
                        style={{
                          borderTop:
                            '1px solid #e5e7eb',
                        }}
                      >
                        <td
                          style={{
                            padding: 9,
                            color:
                              typeColor(
                                item.type
                              ),
                            fontWeight: 700,
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {typeText(
                            item.type
                          )}
                        </td>

                        <td
                          style={{
                            padding: 9,
                          }}
                        >
                          {item.customer_code ||
                            '-'}
                        </td>

                        <td
                          style={{
                            padding: 9,
                          }}
                        >
                          {item.customer_name ||
                            '-'}
                        </td>

                        <td
                          style={{
                            padding: 9,
                            fontWeight: 700,
                          }}
                        >
                          {item.vehicle_plate ||
                            '-'}
                        </td>

                        <td
                          style={{
                            padding: 9,
                          }}
                        >
                          {item.detail ||
                            '-'}
                        </td>
                      </tr>
                    )
                  )}
              </tbody>
            </table>
          </div>

          {result.items.length > 100 && (
            <p className="muted">
              異動預覽只顯示前 100 筆，實際比對共 {result.items.length} 筆異動。
            </p>
          )}
        </div>
      )}
    </div>
  )
}