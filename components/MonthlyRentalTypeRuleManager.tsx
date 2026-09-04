'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  createClient,
} from '@/lib/supabase/client'

type ParkingLot = {
  id: string
  name: string
}

type Rule = {
  id: string
  parking_lot_id: string
  type_name: string
  vehicle_type:
    | 'car'
    | 'motorcycle'
    | 'heavy_motorcycle'
  match_amounts: string
  keywords: string
  keyword_mode:
    | 'any'
    | 'all'
  priority: number
  is_active: boolean
  notes: string
}

type FormData = {
  type_name: string
  vehicle_type:
    | 'car'
    | 'motorcycle'
    | 'heavy_motorcycle'
  match_amounts: string
  keywords: string
  keyword_mode:
    | 'any'
    | 'all'
  priority: string
  is_active: boolean
  notes: string
}

const EMPTY_FORM: FormData = {
  type_name: '',
  vehicle_type:
    'car',
  match_amounts: '',
  keywords: '',
  keyword_mode:
    'any',
  priority: '100',
  is_active: true,
  notes: '',
}

function vehicleTypeText(
  value: string
) {
  if (
    value ===
    'motorcycle'
  ) {
    return '機車'
  }

  if (
    value ===
    'heavy_motorcycle'
  ) {
    return '重機'
  }

  return '汽車'
}

export default function MonthlyRentalTypeRuleManager({
  parkingLots,
}: {
  parkingLots: ParkingLot[]
}) {
  const supabase =
    createClient()

  const [
    selectedLotId,
    setSelectedLotId,
  ] = useState(
    parkingLots[0]?.id ||
      ''
  )

  const [
    rules,
    setRules,
  ] =
    useState<Rule[]>(
      []
    )

  const [
    form,
    setForm,
  ] =
    useState<FormData>(
      EMPTY_FORM
    )

  const [
    editingId,
    setEditingId,
  ] =
    useState('')

  const [
    loading,
    setLoading,
  ] =
    useState(false)

  const [
    saving,
    setSaving,
  ] =
    useState(false)

  const [
    message,
    setMessage,
  ] =
    useState('')

  useEffect(() => {
    if (
      selectedLotId
    ) {
      void loadRules(
        selectedLotId
      )
    } else {
      setRules([])
    }
  }, [
    selectedLotId,
  ])

  async function loadRules(
    parkingLotId:
      string
  ) {
    setLoading(true)
    setMessage('')

    try {
      const {
        data,
        error,
      } =
        await supabase
          .from(
            'monthly_rental_type_rules'
          )
          .select(`
            id,
            parking_lot_id,
            type_name,
            vehicle_type,
            match_amounts,
            keywords,
            keyword_mode,
            priority,
            is_active,
            notes
          `)
          .eq(
            'parking_lot_id',
            parkingLotId
          )
          .order(
            'priority',
            {
              ascending:
                true,
            }
          )
          .order(
            'type_name',
            {
              ascending:
                true,
            }
          )

      if (
        error
      ) {
        setMessage(
          `規則讀取失敗：${error.message}`
        )
        setRules([])
        return
      }

      setRules(
        (data ||
          []) as Rule[]
      )
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setForm(
      EMPTY_FORM
    )
    setEditingId('')
  }

  function startEdit(
    rule: Rule
  ) {
    setEditingId(
      rule.id
    )

    setForm({
      type_name:
        rule.type_name,

      vehicle_type:
        rule.vehicle_type,

      match_amounts:
        rule.match_amounts ||
        '',

      keywords:
        rule.keywords ||
        '',

      keyword_mode:
        rule.keyword_mode ||
        'any',

      priority:
        String(
          rule.priority ??
            100
        ),

      is_active:
        Boolean(
          rule.is_active
        ),

      notes:
        rule.notes ||
        '',
    })

    window.scrollTo({
      top: 0,
      behavior:
        'smooth',
    })
  }

  async function saveRule() {
    if (
      !selectedLotId
    ) {
      setMessage(
        '請先選擇停車場'
      )
      return
    }

    if (
      !form.type_name.trim()
    ) {
      setMessage(
        '請輸入月租類型名稱'
      )
      return
    }

    if (
      !form.match_amounts.trim() &&
      !form.keywords.trim()
    ) {
      setMessage(
        '「可辨識金額」與「關鍵字」至少要設定一項，避免規則套用到全部月租戶。'
      )
      return
    }

    const priority =
      Number(
        form.priority
      )

    if (
      !Number.isFinite(
        priority
      )
    ) {
      setMessage(
        '優先順序必須是數字'
      )
      return
    }

    setSaving(true)
    setMessage('')

    try {
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
        setMessage(
          '登入狀態失效，請重新登入'
        )
        return
      }

      const payload = {
        parking_lot_id:
          selectedLotId,

        type_name:
          form.type_name
            .trim(),

        vehicle_type:
          form.vehicle_type,

        match_amounts:
          form.match_amounts
            .trim(),

        keywords:
          form.keywords
            .trim(),

        keyword_mode:
          form.keyword_mode,

        priority,

        is_active:
          form.is_active,

        notes:
          form.notes
            .trim(),

        updated_by:
          user.id,
      }

      if (
        editingId
      ) {
        const {
          error,
        } =
          await supabase
            .from(
              'monthly_rental_type_rules'
            )
            .update(
              payload
            )
            .eq(
              'id',
              editingId
            )

        if (
          error
        ) {
          setMessage(
            `修改失敗：${error.message}`
          )
          return
        }

        setMessage(
          '月租類型規則已修改'
        )
      } else {
        const {
          error,
        } =
          await supabase
            .from(
              'monthly_rental_type_rules'
            )
            .insert({
              ...payload,
              created_by:
                user.id,
            })

        if (
          error
        ) {
          setMessage(
            `新增失敗：${error.message}`
          )
          return
        }

        setMessage(
          '月租類型規則已新增'
        )
      }

      resetForm()

      await loadRules(
        selectedLotId
      )
    } finally {
      setSaving(false)
    }
  }

  async function deleteRule(
    rule: Rule
  ) {
    const confirmed =
      window.confirm(
        `確定刪除「${rule.type_name}」辨識規則？\n\n刪除後之後匯入的月租總表將不再使用這條規則。`
      )

    if (
      !confirmed
    ) {
      return
    }

    const {
      error,
    } =
      await supabase
        .from(
          'monthly_rental_type_rules'
        )
        .delete()
        .eq(
          'id',
          rule.id
        )

    if (
      error
    ) {
      setMessage(
        `刪除失敗：${error.message}`
      )
      return
    }

    setMessage(
      '規則已刪除'
    )

    if (
      editingId ===
      rule.id
    ) {
      resetForm()
    }

    await loadRules(
      selectedLotId
    )
  }

  const selectedLot =
    useMemo(
      () =>
        parkingLots.find(
          (
            lot
          ) =>
            lot.id ===
            selectedLotId
        ),
      [
        parkingLots,
        selectedLotId,
      ]
    )

  return (
    <div>
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
              'grid',
            gridTemplateColumns:
              'minmax(260px,1fr) minmax(260px,2fr)',
            gap: 14,
            alignItems:
              'end',
          }}
        >
          <div
            className="field"
          >
            <label>
              停車場
            </label>

            <select
              value={
                selectedLotId
              }
              onChange={(
                event
              ) => {
                setSelectedLotId(
                  event
                    .target
                    .value
                )

                resetForm()
                setMessage('')
              }}
            >
              {parkingLots.map(
                (
                  lot
                ) => (
                  <option
                    key={
                      lot.id
                    }
                    value={
                      lot.id
                    }
                  >
                    {lot.name}
                  </option>
                )
              )}
            </select>
          </div>

          <div
            style={{
              color:
                '#64748b',
              fontSize: 13,
              paddingBottom:
                10,
            }}
          >
            每個停車場獨立設定。場站管理員不會看到這個設定頁，只會在匯入月租總表時自動套用。
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{
          marginTop:
            20,
        }}
      >
        <h2
          style={{
            marginTop: 0,
          }}
        >
          {editingId
            ? '修改辨識規則'
            : '新增辨識規則'}
        </h2>

        <div
          style={{
            display:
              'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(210px,1fr))',
            gap: 14,
          }}
        >
          <div className="field">
            <label>
              月租類型名稱 *
            </label>

            <input
              value={
                form.type_name
              }
              onChange={(
                e
              ) =>
                setForm({
                  ...form,
                  type_name:
                    e.target
                      .value,
                })
              }
              placeholder="例如：里民、一般、老師機車"
            />
          </div>

          <div className="field">
            <label>
              自動判定車種 *
            </label>

            <select
              value={
                form.vehicle_type
              }
              onChange={(
                e
              ) =>
                setForm({
                  ...form,
                  vehicle_type:
                    e.target
                      .value as FormData['vehicle_type'],
                })
              }
            >
              <option value="car">
                汽車
              </option>

              <option value="motorcycle">
                機車
              </option>

              <option value="heavy_motorcycle">
                重機
              </option>
            </select>
          </div>

          <div className="field">
            <label>
              可辨識金額
            </label>

            <input
              value={
                form.match_amounts
              }
              onChange={(
                e
              ) =>
                setForm({
                  ...form,
                  match_amounts:
                    e.target
                      .value,
                })
              }
              placeholder="例如：1800,3600,5400"
            />

            <small
              className="muted"
            >
              多個金額用逗號分開；空白＝不限金額。
            </small>
          </div>

          <div className="field">
            <label>
              辨識關鍵字
            </label>

            <input
              value={
                form.keywords
              }
              onChange={(
                e
              ) =>
                setForm({
                  ...form,
                  keywords:
                    e.target
                      .value,
                })
              }
              placeholder="例如：里民,住戶"
            />

            <small
              className="muted"
            >
              會從原月票種類、備註、姓名等文字尋找。
            </small>
          </div>

          <div className="field">
            <label>
              關鍵字條件
            </label>

            <select
              value={
                form.keyword_mode
              }
              onChange={(
                e
              ) =>
                setForm({
                  ...form,
                  keyword_mode:
                    e.target
                      .value as FormData['keyword_mode'],
                })
              }
            >
              <option value="any">
                符合任一關鍵字
              </option>

              <option value="all">
                必須全部符合
              </option>
            </select>
          </div>

          <div className="field">
            <label>
              優先順序
            </label>

            <input
              type="number"
              value={
                form.priority
              }
              onChange={(
                e
              ) =>
                setForm({
                  ...form,
                  priority:
                    e.target
                      .value,
                })
              }
            />

            <small
              className="muted">
              數字越小越優先，例如 10 會先於 100。
            </small>
          </div>

          <div className="field">
            <label>
              狀態
            </label>

            <select
              value={
                form.is_active
                  ? 'active'
                  : 'inactive'
              }
              onChange={(
                e
              ) =>
                setForm({
                  ...form,
                  is_active:
                    e.target
                      .value ===
                    'active',
                })
              }
            >
              <option value="active">
                啟用
              </option>

              <option value="inactive">
                停用
              </option>
            </select>
          </div>

          <div className="field">
            <label>
              備註
            </label>

            <input
              value={
                form.notes
              }
              onChange={(
                e
              ) =>
                setForm({
                  ...form,
                  notes:
                    e.target
                      .value,
                })
              }
              placeholder="主管自己的設定說明"
            />
          </div>
        </div>

        <div
          style={{
            marginTop:
              16,
            display:
              'flex',
            gap: 8,
            flexWrap:
              'wrap',
          }}
        >
          <button
            type="button"
            className="btn"
            disabled={
              saving
            }
            onClick={
              saveRule
            }
          >
            {saving
              ? '儲存中…'
              : editingId
                ? '儲存修改'
                : '新增規則'}
          </button>

          {editingId && (
            <button
              type="button"
              disabled={
                saving
              }
              onClick={
                resetForm
              }
            >
              取消修改
            </button>
          )}
        </div>

        {message && (
          <div
            style={{
              marginTop:
                14,
              padding: 12,
              borderRadius:
                8,
              background:
                '#f8fafc',
            }}
          >
            {message}
          </div>
        )}
      </div>

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
            gap: 12,
            flexWrap:
              'wrap',
          }}
        >
          <h2
            style={{
              margin: 0,
            }}
          >
            {selectedLot?.name ||
              '停車場'}
            {' '}辨識規則
          </h2>

          <strong>
            共 {rules.length} 條
          </strong>
        </div>

        <div
          style={{
            marginTop:
              10,
            color:
              '#64748b',
            fontSize: 13,
          }}
        >
          規則會先依「優先順序」判斷。金額與關鍵字都有填時，兩個條件都必須符合才套用。
        </div>

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
                1000,
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
                <th>順序</th>
                <th>類型</th>
                <th>車種</th>
                <th>金額條件</th>
                <th>關鍵字</th>
                <th>關鍵字方式</th>
                <th>狀態</th>
                <th>備註</th>
                <th>操作</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={
                      9
                    }
                    style={{
                      padding:
                        20,
                    }}
                  >
                    讀取中…
                  </td>
                </tr>
              ) : rules.length ===
                0 ? (
                <tr>
                  <td
                    colSpan={
                      9
                    }
                    style={{
                      padding:
                        20,
                      color:
                        '#64748b',
                    }}
                  >
                    這個停車場尚未設定月租類型辨識規則。
                  </td>
                </tr>
              ) : (
                rules.map(
                  (
                    rule
                  ) => (
                    <tr
                      key={
                        rule.id
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
                        }}
                      >
                        {rule.priority}
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                          fontWeight:
                            700,
                        }}
                      >
                        {rule.type_name}
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                        }}
                      >
                        {vehicleTypeText(
                          rule.vehicle_type
                        )}
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                        }}
                      >
                        {rule.match_amounts ||
                          '不限'}
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                          maxWidth:
                            240,
                          whiteSpace:
                            'normal',
                          wordBreak:
                            'break-word',
                        }}
                      >
                        {rule.keywords ||
                          '不限'}
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                        }}
                      >
                        {rule.keyword_mode ===
                        'all'
                          ? '全部符合'
                          : '任一符合'}
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                          color:
                            rule.is_active
                              ? '#15803d'
                              : '#64748b',
                          fontWeight:
                            700,
                        }}
                      >
                        {rule.is_active
                          ? '啟用'
                          : '停用'}
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                          maxWidth:
                            220,
                          whiteSpace:
                            'normal',
                          wordBreak:
                            'break-word',
                        }}
                      >
                        {rule.notes ||
                          '-'}
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            startEdit(
                              rule
                            )
                          }
                          style={{
                            marginRight:
                              8,
                          }}
                        >
                          修改
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            deleteRule(
                              rule
                            )
                          }
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
