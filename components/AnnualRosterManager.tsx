'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type ParkingLot = {
  id: string
  name: string
}

type Roster = {
  id: string
  parking_lot_id: string
  roster_year: number
  title: string | null
  status: string
  created_at: string

  parking_lots?: {
    id: string
    name: string
  } | null
}

type ImportMember = {
  customer_code: string
  customer_name: string
  phone: string

  vehicle_plate: string

  vehicle_type:
    | 'car'
    | 'motorcycle'
    | 'heavy_motorcycle'

  rental_type: string

  start_date: string
  end_date: string

  monthly_fee: number

  transaction_no: string

  notes: string
}

const TYPE_KEYWORDS = [
  '里民',
  '身障',
  '一般',
  '老師汽車單月',
  '老師 機車',
  '老師機車',
  '重機',
  '機車',
]

function normalizeDate(value: string) {
  const v = value.trim()

  const match = v.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/
  )

  if (!match) {
    return ''
  }

  return `${match[1]}-${match[2].padStart(
    2,
    '0'
  )}-${match[3].padStart(2, '0')}`
}

function normalizePlate(value: string) {
  return value
    .trim()
    .replace(/\s/g, '')
    .replace(/-/g, '')
    .toUpperCase()
}

function looksLikePhone(value: string) {
  return /^0\d[\d\-]{7,12}$/.test(
    value.replace(/\s/g, '')
  )
}

function detectVehicleType(
  rentalType: string,
  legacyType: string
):
  | 'car'
  | 'motorcycle'
  | 'heavy_motorcycle' {
  const value = `${rentalType} ${legacyType}`

  if (value.includes('重機')) {
    return 'heavy_motorcycle'
  }

  if (value.includes('機車')) {
    return 'motorcycle'
  }

  return 'car'
}

function splitCsvLine(line: string) {
  const result: string[] = []

  let field = ''
  let quoted = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (
        quoted &&
        line[i + 1] === '"'
      ) {
        field += '"'
        i++
      } else {
        quoted = !quoted
      }

      continue
    }

    if (char === ',' && !quoted) {
      result.push(field.trim())
      field = ''
      continue
    }

    field += char
  }

  result.push(field.trim())

  return result
}

async function decodeFile(file: File) {
  const buffer = await file.arrayBuffer()

  let value = ''

  try {
    value = new TextDecoder('big5').decode(buffer)
  } catch {
    value = new TextDecoder('utf-8').decode(buffer)
  }

  if ((value.match(/�/g) || []).length > 5) {
    value = new TextDecoder('utf-8').decode(buffer)
  }

  return value
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

async function parseLegacyRoster(
  file: File
): Promise<ImportMember[]> {
  const csv = await decodeFile(file)

  const lines = csv.split('\n')

  const members: ImportMember[] = []

  let current: ImportMember | null = null

  function finish() {
    if (!current) {
      return
    }

    if (
      current.vehicle_plate &&
      current.customer_name
    ) {
      members.push(current)
    }

    current = null
  }

  for (const raw of lines) {
    const line = raw.trim()

    if (!line) {
      continue
    }

    if (
      line.includes('客戶編號') &&
      line.includes('姓名')
    ) {
      continue
    }

    const cols = splitCsvLine(raw)

    const code =
      String(cols[0] || '').trim()

    const isMain =
      cols.length >= 8 &&
      /^\d+$/.test(code) &&
      Boolean(cols[1]) &&
      Boolean(cols[2])

    if (isMain) {
      finish()

      const [
        customerCode,
        plate,
        name,
        startRaw,
        endRaw,
        feeRaw,
        transactionNo,
        legacyType,
        ...notes
      ] = cols

      const originalNote =
        notes.join(',').trim()

      current = {
        customer_code:
          customerCode || '',

        customer_name:
          name?.trim() || '',

        phone:
          looksLikePhone(originalNote)
            ? originalNote
            : '',

        vehicle_plate:
          plate?.trim().toUpperCase() || '',

        vehicle_type:
          detectVehicleType(
            '',
            legacyType || ''
          ),

        rental_type: '',

        start_date:
          normalizeDate(startRaw || ''),

        end_date:
          normalizeDate(endRaw || ''),

        monthly_fee:
          Number(
            String(feeRaw || '')
              .replace(/,/g, '')
          ) || 0,

        transaction_no:
          transactionNo || '',

        notes:
          looksLikePhone(originalNote)
            ? ''
            : originalNote,
      }

      continue
    }

    if (!current) {
      continue
    }

    const type =
      TYPE_KEYWORDS.find(
        (keyword) =>
          line === keyword ||
          line.includes(keyword)
      )

    if (type) {
      current.rental_type = line

      current.vehicle_type =
        detectVehicleType(line, '')

      continue
    }

    if (looksLikePhone(line)) {
      if (!current.phone) {
        current.phone = line
      } else {
        current.notes = [
          current.notes,
          line,
        ]
          .filter(Boolean)
          .join(' / ')
      }

      continue
    }

    current.notes = [
      current.notes,
      line,
    ]
      .filter(Boolean)
      .join(' / ')
  }

  finish()

  return members
}

export default function AnnualRosterManager({
  parkingLots,
  rosters,
}: {
  parkingLots: ParkingLot[]
  rosters: Roster[]
}) {
  const router = useRouter()

  const fileRef =
    useRef<HTMLInputElement>(null)

  const currentYear =
    new Date().getFullYear()

  const [lotId, setLotId] =
    useState(parkingLots[0]?.id || '')

  const [year, setYear] =
    useState(currentYear)

  const [selectedRosterId, setSelectedRosterId] =
    useState('')

  const [preview, setPreview] =
    useState<ImportMember[]>([])

  const [fileName, setFileName] =
    useState('')

  const [busy, setBusy] =
    useState(false)

  const [message, setMessage] =
    useState('')

  const selectedRoster =
    rosters.find(
      (item) =>
        item.id === selectedRosterId
    )

  async function createRoster() {
    if (!lotId) {
      alert('請選擇停車場')
      return
    }

    if (!year) {
      alert('請輸入年度')
      return
    }

    setBusy(true)
    setMessage('')

    try {
      const supabase = createClient()

      const {
        data: { user },
      } =
        await supabase.auth.getUser()

      if (!user) {
        alert('請重新登入')
        return
      }

      const {
        data,
        error,
      } = await supabase
        .from('monthly_lottery_rosters')
        .insert({
          parking_lot_id: lotId,
          roster_year: year,
          title: `${year} 年度抽籤總表`,
          status: 'draft',
          created_by: user.id,
        })
        .select('id')
        .single()

      if (error) {
        if (
          error.message.includes(
            'duplicate'
          )
        ) {
          setMessage(
            '這個停車場已經有此年度的抽籤總表。'
          )
        } else {
          setMessage(
            `建立失敗：${error.message}`
          )
        }

        return
      }

      setMessage('年度抽籤總表建立完成。')

      setSelectedRosterId(data.id)

      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function chooseFile(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0]

    if (!file) {
      return
    }

    setBusy(true)
    setMessage('')
    setFileName(file.name)

    try {
      const rows =
        await parseLegacyRoster(file)

      setPreview(rows)

      setMessage(
        `已辨識 ${rows.length} 筆年度抽籤資料，請確認後再儲存。`
      )
    } catch (error: any) {
      setMessage(
        `讀取失敗：${
          error?.message || '未知錯誤'
        }`
      )
    } finally {
      setBusy(false)
    }
  }

  async function saveRosterMembers() {
    if (!selectedRosterId) {
      alert('請先選擇年度抽籤總表')
      return
    }

    if (!preview.length) {
      alert('請先選擇 CSV')
      return
    }

    if (
      !window.confirm(
        `確定儲存 ${preview.length} 筆年度抽籤原始名單？\n\n如果這個年度已有資料，原名單會被這次匯入內容取代。`
      )
    ) {
      return
    }

    setBusy(true)
    setMessage('')

    try {
      const supabase = createClient()

      const {
        error: deleteError,
      } = await supabase
        .from('monthly_lottery_members')
        .delete()
        .eq(
          'roster_id',
          selectedRosterId
        )

      if (deleteError) {
        setMessage(
          `清除舊名單失敗：${deleteError.message}`
        )
        return
      }

      const rows = preview.map(
        (item) => ({
          roster_id:
            selectedRosterId,

          customer_code:
            item.customer_code || null,

          customer_name:
            item.customer_name,

          phone:
            item.phone || null,

          vehicle_plate:
            item.vehicle_plate,

          vehicle_type:
            item.vehicle_type,

          rental_type:
            item.rental_type || null,

          start_date:
            item.start_date || null,

          end_date:
            item.end_date || null,

          monthly_fee:
            item.monthly_fee,

          transaction_no:
            item.transaction_no || null,

          notes:
            item.notes || null,
        })
      )

      for (
        let i = 0;
        i < rows.length;
        i += 300
      ) {
        const chunk =
          rows.slice(i, i + 300)

        const { error } =
          await supabase
            .from('monthly_lottery_members')
            .insert(chunk)

        if (error) {
          setMessage(
            `儲存失敗：${error.message}`
          )
          return
        }
      }

      setMessage(
        `年度原始名單已保存，共 ${rows.length} 筆。下一步可按「套用到目前月租總表」。`
      )

      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function applyRoster() {
    if (!selectedRoster) {
      alert('請選擇年度抽籤總表')
      return
    }

    if (
      !window.confirm(
        `確定將 ${selectedRoster.roster_year} 年度抽籤名單套用到目前月租總表？\n\n系統會自動判斷：\n・原本就在名單 → 更新／延續\n・新年度才出現 → 新加入\n・目前月租有、年度名單沒有 → 退租\n\n原本年度抽籤資料不會刪除。`
      )
    ) {
      return
    }

    setBusy(true)
    setMessage('正在比較年度名單…')

    try {
      const supabase = createClient()

      const {
        data: { user },
      } =
        await supabase.auth.getUser()

      if (!user) {
        setMessage('登入狀態失效')
        return
      }

      const {
        data: members,
        error: memberError,
      } = await supabase
        .from('monthly_lottery_members')
        .select('*')
        .eq(
          'roster_id',
          selectedRoster.id
        )

      if (memberError) {
        setMessage(
          `年度名單讀取失敗：${memberError.message}`
        )
        return
      }

      if (!members?.length) {
        setMessage(
          '這份年度抽籤總表目前沒有名單。'
        )
        return
      }

      const {
        data: currentRentals,
        error: rentalError,
      } = await supabase
        .from('monthly_rentals')
        .select('*')
        .eq(
          'parking_lot_id',
          selectedRoster.parking_lot_id
        )
        .neq(
          'rental_status',
          'cancelled'
        )

      if (rentalError) {
        setMessage(
          `目前月租資料讀取失敗：${rentalError.message}`
        )
        return
      }

      const currentMap =
        new Map<string, any>()

      for (
        const rental of currentRentals || []
      ) {
        currentMap.set(
          normalizePlate(
            rental.vehicle_plate
          ),
          rental
        )
      }

      const newPlateSet =
        new Set<string>()

      let continued = 0
      let joined = 0
      let cancelled = 0
      let failed = 0

      /*
       * 年度新名單：
       * 有舊資料 → 延續/更新
       * 沒舊資料 → 新增
       */
      for (const member of members) {
        const plateKey =
          normalizePlate(
            member.vehicle_plate
          )

        newPlateSet.add(plateKey)

        const existing =
          currentMap.get(plateKey)

        const payload = {
          customer_code:
            member.customer_code,

          customer_name:
            member.customer_name,

          phone:
            member.phone,

          vehicle_plate:
            member.vehicle_plate,

          vehicle_type:
            member.vehicle_type,

          rental_type:
            member.rental_type,

          start_date:
            member.start_date,

          end_date:
            member.end_date,

          monthly_fee:
            member.monthly_fee,

          rental_status:
            'active',

          updated_at:
            new Date().toISOString(),
        }

        if (existing) {
          const { error } =
            await supabase
              .from('monthly_rentals')
              .update(payload)
              .eq(
                'id',
                existing.id
              )

          if (error) {
            failed++
          } else {
            continued++
          }
        } else {
          const { error } =
            await supabase
              .from('monthly_rentals')
              .insert({
                ...payload,

                parking_lot_id:
                  selectedRoster.parking_lot_id,

                payment_status:
                  'unpaid',

                payment_date:
                  null,

                invoice_number:
                  null,

                notes:
                  `${selectedRoster.roster_year} 年度抽籤新加入`,

                created_by:
                  user.id,
              })

          if (error) {
            failed++
          } else {
            joined++
          }
        }
      }

      /*
       * 目前有，但新年度名單沒有：
       * 自動退租
       */
      for (
        const rental of currentRentals || []
      ) {
        const plateKey =
          normalizePlate(
            rental.vehicle_plate
          )

        if (
          !newPlateSet.has(
            plateKey
          )
        ) {
          const { error } =
            await supabase
              .from('monthly_rentals')
              .update({
                rental_status:
                  'cancelled',

                updated_at:
                  new Date().toISOString(),
              })
              .eq(
                'id',
                rental.id
              )

          if (error) {
            failed++
          } else {
            cancelled++
          }
        }
      }

      /*
       * 同一停車場舊年度改為歷史
       */
      await supabase
        .from('monthly_lottery_rosters')
        .update({
          status: 'history',
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'parking_lot_id',
          selectedRoster.parking_lot_id
        )
        .neq(
          'id',
          selectedRoster.id
        )

      /*
       * 本年度改為使用中
       */
      await supabase
        .from('monthly_lottery_rosters')
        .update({
          status: 'active',
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          selectedRoster.id
        )

      setMessage(
        `年度總表套用完成：延續 ${continued} 筆、新加入 ${joined} 筆、退租 ${cancelled} 筆、失敗 ${failed} 筆。`
      )

      if (failed === 0) {
        setTimeout(() => {
          window.location.href =
            '/dashboard/monthly-rentals'
        }, 1200)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>
          建立年度抽籤總表
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            marginTop: 16,
          }}
        >
          <div className="field">
            <label>停車場</label>

            <select
              value={lotId}
              onChange={(e) =>
                setLotId(e.target.value)
              }
            >
              {parkingLots.map(
                (lot) => (
                  <option
                    key={lot.id}
                    value={lot.id}
                  >
                    {lot.name}
                  </option>
                )
              )}
            </select>
          </div>

          <div className="field">
            <label>年度</label>

            <input
              type="number"
              value={year}
              min={2020}
              max={2100}
              onChange={(e) =>
                setYear(
                  Number(e.target.value)
                )
              }
            />
          </div>
        </div>

        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={createRoster}
          style={{
            marginTop: 14,
          }}
        >
          建立年度總表
        </button>
      </div>

      <div
        className="card"
        style={{
          marginTop: 20,
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          已建立年度總表
        </h2>

        <div className="field">
          <label>
            選擇要管理的年度
          </label>

          <select
            value={selectedRosterId}
            onChange={(e) => {
              setSelectedRosterId(
                e.target.value
              )

              setPreview([])
              setFileName('')
            }}
          >
            <option value="">
              請選擇
            </option>

            {rosters.map(
              (roster) => (
                <option
                  key={roster.id}
                  value={roster.id}
                >
                  {roster.parking_lots?.name ||
                    '停車場'}{' '}
                  ｜ {roster.roster_year} 年
                  ｜{' '}
                  {roster.status === 'active'
                    ? '目前使用'
                    : roster.status ===
                        'history'
                      ? '歷史'
                      : '草稿'}
                </option>
              )
            )}
          </select>
        </div>

        {selectedRoster && (
          <>
            <div
              style={{
                marginTop: 18,
                padding: 14,
                borderRadius: 10,
                background: '#f8fafc',
              }}
            >
              <strong>
                {selectedRoster.parking_lots?.name}
              </strong>

              <div style={{ marginTop: 4 }}>
                {selectedRoster.roster_year}{' '}
                年度抽籤總表
              </div>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,.CSV"
              onChange={chooseFile}
              style={{
                display: 'none',
              }}
            />

            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginTop: 16,
              }}
            >
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  fileRef.current?.click()
                }
              >
                選擇年度總表 CSV
              </button>

              {preview.length > 0 && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={
                    saveRosterMembers
                  }
                >
                  儲存年度原始名單
                </button>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={applyRoster}
                style={{
                  padding: '9px 14px',
                  borderRadius: 8,
                  border:
                    '1px solid #0f172a',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                套用到目前月租總表
              </button>
            </div>

            {fileName && (
              <p>
                已選擇：{fileName}
              </p>
            )}
          </>
        )}

        {message && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              background: '#f8fafc',
            }}
          >
            {message}
          </div>
        )}
      </div>

      {preview.length > 0 && (
        <div
          className="card"
          style={{
            marginTop: 20,
          }}
        >
          <h2 style={{ marginTop: 0 }}>
            年度名單預覽
          </h2>

          <p className="muted">
            共 {preview.length} 筆
          </p>

          <div
            style={{
              overflowX: 'auto',
            }}
          >
            <table
              style={{
                width: '100%',
                minWidth: 1100,
                borderCollapse:
                  'collapse',
              }}
            >
              <thead>
                <tr>
                  <th>客戶編號</th>
                  <th>姓名</th>
                  <th>電話</th>
                  <th>車牌</th>
                  <th>車種</th>
                  <th>類型</th>
                  <th>租用期間</th>
                  <th>金額</th>
                </tr>
              </thead>

              <tbody>
                {preview
                  .slice(0, 200)
                  .map(
                    (item, index) => (
                      <tr
                        key={index}
                        style={{
                          borderTop:
                            '1px solid #e5e7eb',
                        }}
                      >
                        <td
                          style={{
                            padding: 8,
                          }}
                        >
                          {item.customer_code}
                        </td>

                        <td
                          style={{
                            padding: 8,
                          }}
                        >
                          {item.customer_name}
                        </td>

                        <td
                          style={{
                            padding: 8,
                          }}
                        >
                          {item.phone || '-'}
                        </td>

                        <td
                          style={{
                            padding: 8,
                            fontWeight: 700,
                          }}
                        >
                          {item.vehicle_plate}
                        </td>

                        <td
                          style={{
                            padding: 8,
                          }}
                        >
                          {item.vehicle_type ===
                          'car'
                            ? '汽車'
                            : item.vehicle_type ===
                                'motorcycle'
                              ? '機車'
                              : '重機'}
                        </td>

                        <td
                          style={{
                            padding: 8,
                          }}
                        >
                          {item.rental_type ||
                            '-'}
                        </td>

                        <td
                          style={{
                            padding: 8,
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {item.start_date} ～{' '}
                          {item.end_date}
                        </td>

                        <td
                          style={{
                            padding: 8,
                          }}
                        >
                          $
                          {item.monthly_fee.toLocaleString()}
                        </td>
                      </tr>
                    )
                  )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}