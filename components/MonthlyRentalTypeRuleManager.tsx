'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  createClient,
} from '@/lib/supabase/client'

import {
  parseAllowedPaymentMonths,
} from '@/lib/monthly-payment-preview'

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
  allowed_payment_months: number[] | null
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
  allowed_payment_months: string
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
  allowed_payment_months: '1,2',
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
            allowed_payment_months,
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

      allowed_payment_months:
        parseAllowedPaymentMonths(
          rule.allowed_payment_months
        ).join(','),

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
      !form.match_amounts.trim()
    ) {
      setMessage(
        '請設定單月標準金額。正式付款會用實收金額 ÷ 單月標準金額判斷月份。'
      )
      return
    }

    const allowedPaymentMonths =
      parseAllowedPaymentMonths(
        form.allowed_payment_months,
        []
      )

    if (
      !form.allowed_payment_months.trim() ||
      allowedPaymentMonths.length === 0
    ) {
      setMessage(
        '請設定至少一個允許繳費月份，例如 1,2；季繳可填 1,3。'
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

        allowed_payment_months:
          allowedPaymentMonths,

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
            每個停車場獨立設定。正式繳費辨識只看「停車場＋車種＋實收金額＋此類型允許繳費月份」；現場文字、關鍵字與主管備註只供參考，不會自動決定付款身分。
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
              單月標準金額 *
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
              placeholder="例如：3000"
            />

            <small
              className="muted"
            >
              正式辨識會以其中最小正數作單月標準費。建議每個類型只保留一個單月金額；舊資料若已有多個金額仍可相容。
            </small>
          </div>

          <div className="field">
            <label>
              允許繳費月份 *
            </label>

            <input
              value={
                form.allowed_payment_months
              }
              onChange={(
                e
              ) =>
                setForm({
                  ...form,
                  allowed_payment_months:
                    e.target
                      .value,
                })
              }
              placeholder="例如：1,2；季繳可填 1,3"
            />

            <small
              className="muted"
            >
              多個月份用逗號分開，範圍 1～24。現在可先填 1,2；未來有季繳、半年繳時由主管直接修改，不必再改程式。
            </small>
          </div>

          <div className="field">
            <label>
              現場／舊資料關鍵字（僅供參考）
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
              可不填。這些文字可協助主管人工核對舊名冊，但不參與正式付款自動辨識。
            </small>
          </div>

          <div className="field">
            <label>
              舊資料關鍵字方式
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
              數字越小排序越前；若有重複的同類型／同金額規則會優先保留較小值，但不會用它強行解除付款歧義。
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
              主管條件備註（僅供參考）
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
              placeholder="例如：目前只收單月、雙月；特殊方案另行公告"
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
          正式付款採金額主判斷：同停車場、同車種下，以單月標準金額與各類型「允許繳費月份」找唯一候選。若有兩個以上合法候選就進付款待確認，不使用現場備註或舊文字猜測。
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
                <th>單月標準金額</th>
                <th>允許月份</th>
                <th>參考關鍵字</th>
                <th>參考方式</th>
                <th>狀態</th>
                <th>主管備註</th>
                <th>操作</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={
                      10
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
                      10
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
                          '未設定'}
                      </td>

                      <td
                        style={{
                          padding:
                            10,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {parseAllowedPaymentMonths(
                          rule.allowed_payment_months
                        ).join('、')} 個月
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
