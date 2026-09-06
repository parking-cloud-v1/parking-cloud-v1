'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type ParkingLotOption = {
  id: string
  name: string
}

type DetailRow = {
  detail_start_date: string
  detail_end_date: string
  temporary_cash: number
  monthly_cash: number
}

type PaymentMachineRow = {
  machine_no: number
  machine_name: string
  invoice_start_no: string
  invoice_end_no: string
  amount_due: number
  amount_paid: number
  aps_monthly_count: number
  aps_monthly_amount: number
  electronic_payment_total: number
  mobile_payment_total: number
}

type InitialReport = {
  id: string
  parking_lot_id: string
  closing_date: string
  shift_start_at: string
  shift_end_at: string
  closing_status: 'normal' | 'abnormal'
  invoice_start_no: string | null
  invoice_end_no: string | null
  amount_due: number
  amount_paid: number
  aps_monthly_count: number
  aps_monthly_amount: number
  electronic_payment_total: number
  mobile_payment_total: number
  payment_machine_count?: number | null
  operator_name: string | null
  notes: string | null
  remittance_status?: 'accumulating' | 'remitted'
  remitted_at?: string | null
}

function num(value: any) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function localDateTime(value?: string | null) {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (value: number) =>
    String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(
    date.getMonth() + 1
  )}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`

}

function datePartFromDateTimeLocal(
  value: string,
  fallback: string
) {
  if (!value) {
    return fallback
  }

  const match =
    value.match(
      /^(\d{4}-\d{2}-\d{2})/
    )

  return match?.[1] || fallback
}


function emptyPaymentMachine(
  index: number
): PaymentMachineRow {
  return {
    machine_no: index + 1,
    machine_name: `繳費機 ${index + 1}`,
    invoice_start_no: '',
    invoice_end_no: '',
    amount_due: 0,
    amount_paid: 0,
    aps_monthly_count: 0,
    aps_monthly_amount: 0,
    electronic_payment_total: 0,
    mobile_payment_total: 0,
  }
}

export default function ShiftClosingForm({
  parkingLots,
  initialReport,
  initialDetails = [],
  defaultParkingLotId = '',
}: {
  parkingLots: ParkingLotOption[]
  initialReport?: InitialReport | null
  initialDetails?: DetailRow[]
  defaultParkingLotId?: string
}) {
  const router = useRouter()
  const supabase = createClient()

  const today = new Date()
    .toISOString()
    .slice(0, 10)

  const [saving, setSaving] =
    useState(false)

  const [
    completingRemittance,
    setCompletingRemittance,
  ] = useState(false)

  const [message, setMessage] =
    useState('')

  const [
    parkingLotId,
    setParkingLotId,
  ] = useState(
    initialReport?.parking_lot_id ||
      defaultParkingLotId ||
      ''
  )

  const [
    closingDate,
    setClosingDate,
  ] = useState(
    initialReport?.closing_date ||
      today
  )

  const [
    shiftStartAt,
    setShiftStartAt,
  ] = useState(
    localDateTime(
      initialReport?.shift_start_at
    )
  )

  const [
    shiftEndAt,
    setShiftEndAt,
  ] = useState(
    localDateTime(
      initialReport?.shift_end_at
    )
  )

  const [
    closingStatus,
    setClosingStatus,
  ] = useState<
    'normal' | 'abnormal'
  >(
    initialReport?.closing_status ||
      'normal'
  )

  const [
    invoiceStartNo,
    setInvoiceStartNo,
  ] = useState(
    initialReport?.invoice_start_no ||
      ''
  )

  const [
    invoiceEndNo,
    setInvoiceEndNo,
  ] = useState(
    initialReport?.invoice_end_no ||
      ''
  )

  const [amountDue, setAmountDue] =
    useState(
      num(
        initialReport?.amount_due
      )
    )

  const [
    amountPaid,
    setAmountPaid,
  ] = useState(
    num(
      initialReport?.amount_paid
    )
  )

  const [
    apsMonthlyCount,
    setApsMonthlyCount,
  ] = useState(
    num(
      initialReport?.aps_monthly_count
    )
  )

  const [
    apsMonthlyAmount,
    setApsMonthlyAmount,
  ] = useState(
    num(
      initialReport?.aps_monthly_amount
    )
  )

  const [
    electronicPaymentTotal,
    setElectronicPaymentTotal,
  ] = useState(
    num(
      initialReport?.electronic_payment_total
    )
  )

  const [
    mobilePaymentTotal,
    setMobilePaymentTotal,
  ] = useState(
    num(
      initialReport?.mobile_payment_total
    )
  )

  const [
    machines,
    setMachines,
  ] = useState<PaymentMachineRow[]>([
    {
      machine_no: 1,
      machine_name: '繳費機 1',
      invoice_start_no:
        initialReport?.invoice_start_no ||
        '',
      invoice_end_no:
        initialReport?.invoice_end_no ||
        '',
      amount_due:
        num(initialReport?.amount_due),
      amount_paid:
        num(initialReport?.amount_paid),
      aps_monthly_count:
        num(initialReport?.aps_monthly_count),
      aps_monthly_amount:
        num(initialReport?.aps_monthly_amount),
      electronic_payment_total:
        num(
          initialReport?.electronic_payment_total
        ),
      mobile_payment_total:
        num(
          initialReport?.mobile_payment_total
        ),
    },
  ])

  const [
    machinesLoading,
    setMachinesLoading,
  ] = useState(
    Boolean(initialReport?.id)
  )

  const [
    operatorName,
    setOperatorName,
  ] = useState(
    initialReport?.operator_name ||
      ''
  )

  const [notes, setNotes] =
    useState(
      initialReport?.notes || ''
    )

  const [details, setDetails] =
    useState<DetailRow[]>(
      initialDetails.length > 0
        ? initialDetails
        : [
            {
              detail_start_date:
                datePartFromDateTimeLocal(
                  localDateTime(
                    initialReport?.shift_start_at
                  ),
                  initialReport?.closing_date ||
                    today
                ),
              detail_end_date:
                datePartFromDateTimeLocal(
                  localDateTime(
                    initialReport?.shift_end_at
                  ),
                  initialReport?.closing_date ||
                    today
                ),
              temporary_cash: 0,
              monthly_cash: 0,
            },
          ]
    )


  useEffect(() => {
    if (!initialReport?.id) {
      return
    }

    let active = true

    async function loadPaymentMachines() {
      setMachinesLoading(true)

      const {
        data,
        error,
      } =
        await supabase
          .from(
            'shift_closing_machines'
          )
          .select(`
            machine_no,
            machine_name,
            invoice_start_no,
            invoice_end_no,
            amount_due,
            amount_paid,
            aps_monthly_count,
            aps_monthly_amount,
            electronic_payment_total,
            mobile_payment_total
          `)
          .eq(
            'report_id',
            initialReport!.id
          )
          .order(
            'machine_no',
            {
              ascending: true,
            }
          )

      if (!active) {
        return
      }

      if (error) {
        setMessage(
          `繳費機資料讀取失敗：${error.message}`
        )
        setMachinesLoading(false)
        return
      }

      if (
        data &&
        data.length > 0
      ) {
        setMachines(
          data.map(
            (
              item: any,
              index: number
            ) => ({
              machine_no:
                num(
                  item.machine_no
                ) ||
                index + 1,
              machine_name:
                item.machine_name ||
                `繳費機 ${index + 1}`,
              invoice_start_no:
                item.invoice_start_no ||
                '',
              invoice_end_no:
                item.invoice_end_no ||
                '',
              amount_due:
                num(
                  item.amount_due
                ),
              amount_paid:
                num(
                  item.amount_paid
                ),
              aps_monthly_count:
                num(
                  item.aps_monthly_count
                ),
              aps_monthly_amount:
                num(
                  item.aps_monthly_amount
                ),
              electronic_payment_total:
                num(
                  item.electronic_payment_total
                ),
              mobile_payment_total:
                num(
                  item.mobile_payment_total
                ),
            })
          )
        )
      }

      setMachinesLoading(false)
    }

    void loadPaymentMachines()

    return () => {
      active = false
    }
  }, [
    initialReport?.id,
  ])

  const machineTotals =
    useMemo(() => {
      return machines.reduce(
        (
          total,
          item
        ) => {
          total.amount_due +=
            num(
              item.amount_due
            )
          total.amount_paid +=
            num(
              item.amount_paid
            )
          total.aps_monthly_count +=
            num(
              item.aps_monthly_count
            )
          total.aps_monthly_amount +=
            num(
              item.aps_monthly_amount
            )
          total.electronic_payment_total +=
            num(
              item.electronic_payment_total
            )
          total.mobile_payment_total +=
            num(
              item.mobile_payment_total
            )

          return total
        },
        {
          amount_due: 0,
          amount_paid: 0,
          aps_monthly_count: 0,
          aps_monthly_amount: 0,
          electronic_payment_total: 0,
          mobile_payment_total: 0,
        }
      )
    }, [
      machines,
    ])

  useEffect(() => {
    setInvoiceStartNo(
      machines[0]
        ?.invoice_start_no ||
        ''
    )
    setInvoiceEndNo(
      machines[0]
        ?.invoice_end_no ||
        ''
    )
    setAmountDue(
      machineTotals.amount_due
    )
    setAmountPaid(
      machineTotals.amount_paid
    )
    setApsMonthlyCount(
      machineTotals.aps_monthly_count
    )
    setApsMonthlyAmount(
      machineTotals.aps_monthly_amount
    )
    setElectronicPaymentTotal(
      machineTotals.electronic_payment_total
    )
    setMobilePaymentTotal(
      machineTotals.mobile_payment_total
    )
  }, [
    machines,
    machineTotals,
  ])

  function updateMachine(
    index: number,
    patch: Partial<PaymentMachineRow>
  ) {
    setMachines(
      (
        current
      ) =>
        current.map(
          (
            item,
            itemIndex
          ) =>
            itemIndex ===
            index
              ? {
                  ...item,
                  ...patch,
                }
              : item
        )
    )
  }

  function changeMachineCount(
    nextCount: number
  ) {
    const count =
      Math.min(
        10,
        Math.max(
          1,
          Math.floor(
            num(
              nextCount
            )
          )
        )
      )

    setMachines(
      (
        current
      ) => {
        if (
          count ===
          current.length
        ) {
          return current
        }

        if (
          count <
          current.length
        ) {
          const removed =
            current.slice(
              count
            )

          const hasData =
            removed.some(
              (
                item
              ) =>
                item.invoice_start_no ||
                item.invoice_end_no ||
                num(
                  item.amount_due
                ) !==
                  0 ||
                num(
                  item.amount_paid
                ) !==
                  0 ||
                num(
                  item.aps_monthly_count
                ) !==
                  0 ||
                num(
                  item.aps_monthly_amount
                ) !==
                  0 ||
                num(
                  item.electronic_payment_total
                ) !==
                  0 ||
                num(
                  item.mobile_payment_total
                ) !==
                  0
            )

          if (
            hasData &&
            !window.confirm(
              `將繳費機數量改為 ${count} 台，會移除後面已輸入的繳費機資料，確定繼續？`
            )
          ) {
            return current
          }

          return current
            .slice(
              0,
              count
            )
            .map(
              (
                item,
                index
              ) => ({
                ...item,
                machine_no:
                  index + 1,
              })
            )
        }

        const next =
          [
            ...current,
          ]

        while (
          next.length <
          count
        ) {
          next.push(
            emptyPaymentMachine(
              next.length
            )
          )
        }

        return next
      }
    )
  }


  /*
   * 目前結班日的第一筆「當日結班明細」自動套用：
   * 臨停現金 = 實收總計 - 電子支付 - 手機支付 - APS 本日月租金額
   * 月租現金 = APS 本日月租金額
   *
   * 若另外新增其他日期的明細，仍可手動輸入，
   * 避免影響其他結班區間資料。
   */

  /*
   * 電子支付 + 手機支付總和
   */
  const digitalPaymentTotal =
    useMemo(
      () =>
        num(
          electronicPaymentTotal
        ) +
        num(
          mobilePaymentTotal
        ),
      [
        electronicPaymentTotal,
        mobilePaymentTotal,
      ]
    )

  /*
   * 月租現金 = APS 本日月租金額
   */
  const apsMonthlyCash = useMemo(
    () =>
      num(
        apsMonthlyAmount
      ),
    [apsMonthlyAmount]
  )

  /*
   * 本班臨停現金實收
   * = 實收總計
   * - (電子支付 + 手機支付)
   * - 月租金額
   */
  const temporaryCashActual =
    useMemo(
      () =>
        num(amountPaid) -
        digitalPaymentTotal -
        apsMonthlyCash,
      [
        amountPaid,
        digitalPaymentTotal,
        apsMonthlyCash,
      ]
    )


  useEffect(() => {
    setDetails((current) => {
      if (current.length === 0) {
        return current
      }

      return current.map(
        (item, index) =>
          index === 0
            ? {
                ...item,
                detail_start_date:
                  datePartFromDateTimeLocal(
                    shiftStartAt,
                    closingDate
                  ),
                detail_end_date:
                  datePartFromDateTimeLocal(
                    shiftEndAt,
                    closingDate
                  ),
                temporary_cash:
                  temporaryCashActual,
                monthly_cash:
                  apsMonthlyCash,
              }
            : item
      )
    })
  }, [
    temporaryCashActual,
    apsMonthlyCash,
    closingDate,
    shiftStartAt,
    shiftEndAt,
  ])

  const remittanceTotal =
    useMemo(
      () =>
        details.reduce(
          (total, item) =>
            total +
            num(
              item.temporary_cash
            ) +
            num(
              item.monthly_cash
            ),
          0
        ),
      [details]
    )

  function updateDetail(
    index: number,
    patch: Partial<DetailRow>
  ) {
    setDetails((current) =>
      current.map(
        (
          item,
          itemIndex
        ) =>
          itemIndex === index
            ? {
                ...item,
                ...patch,
              }
            : item
      )
    )
  }

  function addDetail() {
    setDetails((current) => [
      ...current,
      {
        detail_start_date:
          datePartFromDateTimeLocal(
            shiftStartAt,
            closingDate
          ),
        detail_end_date:
          datePartFromDateTimeLocal(
            shiftEndAt,
            closingDate
          ),
        temporary_cash: 0,
        monthly_cash: 0,
      },
    ])
  }

  function removeDetail(
    index: number
  ) {
    setDetails((current) =>
      current.length <= 1
        ? current
        : current.filter(
            (
              _,
              itemIndex
            ) =>
              itemIndex !==
              index
          )
    )
  }

  async function completeRemittanceAndRestart() {
    if (!initialReport?.id) {
      setMessage(
        '請先儲存這份結班報表，再執行匯款完成。'
      )
      return
    }

    if (
      initialReport.remittance_status ===
      'remitted'
    ) {
      setMessage(
        '這一輪匯款已經完成。'
      )
      return
    }

    const confirmed =
      window.confirm(
        `確定本次匯款已完成？\n\n` +
        `本次匯款總金額：$${remittanceTotal.toLocaleString()}\n\n` +
        `確認後：\n` +
        `1. 目前這份結班報表會保留為「已匯款」歷史\n` +
        `2. 不會刪除任何舊資料\n` +
        `3. 系統會開啟新的結班報表，開始下一輪`
      )

    if (!confirmed) {
      return
    }

    setCompletingRemittance(
      true
    )
    setMessage('')

    try {
      const {
        data: { user },
      } =
        await supabase.auth.getUser()

      if (!user) {
        throw new Error(
          '登入狀態已失效'
        )
      }

      const {
        error,
      } =
        await supabase
          .from(
            'shift_closing_reports'
          )
          .update({
            remittance_status:
              'remitted',
            remitted_at:
              new Date()
                .toISOString(),
            remitted_by:
              user.id,
            updated_by:
              user.id,
            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            'id',
            initialReport.id
          )

      if (error) {
        throw error
      }

      await supabase
        .from(
          'system_logs'
        )
        .insert({
          user_id:
            user.id,
          parking_lot_id:
            parkingLotId ||
            null,
          action:
            'SHIFT_CLOSING_REMITTANCE_COMPLETED',
          entity_type:
            'shift_closing_report',
          entity_id:
            initialReport.id,
          detail: {
            remittance_total:
              remittanceTotal,
            closing_date:
              closingDate,
          },
        })

      window.location.href =
        `/dashboard/shift-closing/new?lot=${encodeURIComponent(
          parkingLotId
        )}&reset=1`
    } catch (
      error: any
    ) {
      console.error(
        error
      )

      setMessage(
        `匯款結清失敗：${
          error?.message ||
          '未知錯誤'
        }`
      )
    } finally {
      setCompletingRemittance(
        false
      )
    }
  }

  async function save() {
    setMessage('')

    if (!parkingLotId) {
      setMessage(
        '請選擇停車場。'
      )
      return
    }

    if (
      !closingDate ||
      !shiftStartAt ||
      !shiftEndAt
    ) {
      setMessage(
        '請完成結班日期與開／結班時間。'
      )
      return
    }

    if (
      new Date(
        shiftEndAt
      ).getTime() <
      new Date(
        shiftStartAt
      ).getTime()
    ) {
      setMessage(
        '結班時間不可早於開班時間。'
      )
      return
    }

    if (
      details.some(
        (item) =>
          !item.detail_start_date ||
          !item.detail_end_date ||
          item.detail_end_date <
            item.detail_start_date
      )
    ) {
      setMessage(
        '請確認當日結班開始日／當日結班結束日。'
      )
      return
    }

    if (
      machines.length < 1
    ) {
      setMessage(
        '請至少保留 1 台繳費機。'
      )
      return
    }

    setSaving(true)

    try {
      const {
        data: { user },
      } =
        await supabase.auth.getUser()

      if (!user) {
        throw new Error(
          '登入狀態已失效'
        )
      }

      const payload = {
        parking_lot_id:
          parkingLotId,

        closing_date:
          closingDate,

        shift_start_at:
          new Date(
            shiftStartAt
          ).toISOString(),

        shift_end_at:
          new Date(
            shiftEndAt
          ).toISOString(),

        closing_status:
          closingStatus,

        invoice_start_no:
          invoiceStartNo ||
          null,

        invoice_end_no:
          invoiceEndNo ||
          null,

        amount_due:
          num(amountDue),

        amount_paid:
          num(amountPaid),

        aps_monthly_count:
          num(
            apsMonthlyCount
          ),

        aps_monthly_amount:
          num(
            apsMonthlyAmount
          ),

        electronic_payment_total:
          num(
            electronicPaymentTotal
          ),

        mobile_payment_total:
          num(
            mobilePaymentTotal
          ),

        payment_machine_count:
          machines.length,

        cash_actual:
          num(
            temporaryCashActual
          ),

        /*
         * 舊資料庫仍保留 refund 欄位，
         * 但畫面已取消，所以固定寫入空值 / 0。
         */
        refund_note: null,
        refund_amount: 0,

        /*
         * 主表欄位保留供歷史查詢，
         * 但數值統一取自下方「當日結班明細」第一筆。
         */
        temporary_cash:
          num(
            details[0]
              ?.temporary_cash
          ),

        monthly_cash:
          num(
            details[0]
              ?.monthly_cash
          ),

        daily_cash_total:
          num(
            details[0]
              ?.temporary_cash
          ) +
          num(
            details[0]
              ?.monthly_cash
          ),

        remittance_total:
          num(
            remittanceTotal
          ),

        operator_name:
          operatorName ||
          null,

        notes:
          notes || null,

        updated_by:
          user.id,

        updated_at:
          new Date().toISOString(),
      }

      let reportId =
        initialReport?.id ||
        ''

      if (
        initialReport?.id
      ) {
        const { error } =
          await supabase
            .from(
              'shift_closing_reports'
            )
            .update(
              payload
            )
            .eq(
              'id',
              initialReport.id
            )

        if (error) {
          throw error
        }

        const {
          error:
            deleteDetailError,
        } =
          await supabase
            .from(
              'shift_closing_details'
            )
            .delete()
            .eq(
              'report_id',
              initialReport.id
            )

        if (
          deleteDetailError
        ) {
          throw deleteDetailError
        }

        const {
          error:
            deleteMachineError,
        } =
          await supabase
            .from(
              'shift_closing_machines'
            )
            .delete()
            .eq(
              'report_id',
              initialReport.id
            )

        if (
          deleteMachineError
        ) {
          throw deleteMachineError
        }
      } else {
        const {
          data,
          error,
        } =
          await supabase
            .from(
              'shift_closing_reports'
            )
            .insert({
              ...payload,
              created_by:
                user.id,
            })
            .select('id')
            .single()

        if (error) {
          throw error
        }

        reportId =
          data.id
      }

      const {
        error:
          machineError,
      } =
        await supabase
          .from(
            'shift_closing_machines'
          )
          .insert(
            machines.map(
              (
                item,
                index
              ) => ({
                report_id:
                  reportId,
                machine_no:
                  index + 1,
                machine_name:
                  item.machine_name ||
                  `繳費機 ${index + 1}`,
                invoice_start_no:
                  item.invoice_start_no ||
                  null,
                invoice_end_no:
                  item.invoice_end_no ||
                  null,
                amount_due:
                  num(
                    item.amount_due
                  ),
                amount_paid:
                  num(
                    item.amount_paid
                  ),
                aps_monthly_count:
                  num(
                    item.aps_monthly_count
                  ),
                aps_monthly_amount:
                  num(
                    item.aps_monthly_amount
                  ),
                electronic_payment_total:
                  num(
                    item.electronic_payment_total
                  ),
                mobile_payment_total:
                  num(
                    item.mobile_payment_total
                  ),
                cash_actual:
                  num(
                    item.amount_paid
                  ) -
                  num(
                    item.electronic_payment_total
                  ) -
                  num(
                    item.mobile_payment_total
                  ) -
                  num(
                    item.aps_monthly_amount
                  ),
                sort_order:
                  index,
              })
            )
          )

      if (
        machineError
      ) {
        throw machineError
      }

      const {
        error:
          detailError,
      } =
        await supabase
          .from(
            'shift_closing_details'
          )
          .insert(
            details.map(
              (
                item,
                index
              ) => ({
                report_id:
                  reportId,

                detail_start_date:
                  item.detail_start_date,

                detail_end_date:
                  item.detail_end_date,

                temporary_cash:
                  num(
                    item.temporary_cash
                  ),

                monthly_cash:
                  num(
                    item.monthly_cash
                  ),

                daily_cash_total:
                  num(
                    item.temporary_cash
                  ) +
                  num(
                    item.monthly_cash
                  ),

                sort_order:
                  index,
              })
            )
          )

      if (
        detailError
      ) {
        throw detailError
      }

      router.push(
        '/dashboard/shift-closing'
      )
      router.refresh()
    } catch (
      error: any
    ) {
      setMessage(
        `儲存失敗：${
          error?.message ||
          '未知錯誤'
        }`
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="shift-closing-form"
    >
      <style jsx global>{`
        .shift-closing-form {
          width: 100%;
          max-width: 1180px;
          min-width: 0;
        }

        .shift-closing-form .closing-grid {
          display: grid;
          grid-template-columns:
            repeat(
              3,
              minmax(0, 1fr)
            );
          gap: 14px;
          width: 100%;
          min-width: 0;
        }

        .shift-closing-form .field {
          min-width: 0;
        }

        .shift-closing-form
          input,
        .shift-closing-form
          select,
        .shift-closing-form
          textarea {
          width: 100%;
          min-width: 0;
          max-width: 100%;
          box-sizing:
            border-box;
        }

        .shift-closing-form
          .closing-table-wrap {
          width: 100%;
          max-width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling:
            touch;
        }

        @media (
          max-width: 1000px
        ) {
          .shift-closing-form
            .closing-grid {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }
        }

        @media (
          max-width: 650px
        ) {
          .shift-closing-form
            .closing-grid {
            grid-template-columns:
              minmax(0, 1fr);
          }

          .shift-closing-form
            .card {
            padding: 14px;
          }
        }
      `}</style>

      <div className="card">
        <h2
          style={{
            marginTop: 0,
          }}
        >
          基本資料
        </h2>

        <div className="closing-grid">
          <div className="field">
            <label>
              停車場
            </label>

            <select
              value={
                parkingLotId
              }
              onChange={(
                event
              ) =>
                setParkingLotId(
                  event.target
                    .value
                )
              }
            >
              <option value="">
                請選擇停車場
              </option>

              {parkingLots.map(
                (lot) => (
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

          <div className="field">
            <label>
              結班日期
            </label>

            <input
              type="date"
              value={
                closingDate
              }
              onChange={(
                event
              ) =>
                setClosingDate(
                  event.target
                    .value
                )
              }
            />
          </div>

          <div className="field">
            <label>
              結班狀態
            </label>

            <select
              value={
                closingStatus
              }
              onChange={(
                event
              ) =>
                setClosingStatus(
                  event.target
                    .value as
                    | 'normal'
                    | 'abnormal'
                )
              }
            >
              <option value="normal">
                正常
              </option>
              <option value="abnormal">
                異常
              </option>
            </select>
          </div>

          <div className="field">
            <label>
              開班日期／時間
            </label>

            <input
              type="datetime-local"
              value={
                shiftStartAt
              }
              onChange={(
                event
              ) =>
                setShiftStartAt(
                  event.target
                    .value
                )
              }
            />
          </div>

          <div className="field">
            <label>
              結班日期／時間
            </label>

            <input
              type="datetime-local"
              value={
                shiftEndAt
              }
              onChange={(
                event
              ) =>
                setShiftEndAt(
                  event.target
                    .value
                )
              }
            />
          </div>

          <div className="field">
            <label>
              值班人員
            </label>

            <input
              value={
                operatorName
              }
              onChange={(
                event
              ) =>
                setOperatorName(
                  event.target
                    .value
                )
              }
            />
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{
          marginTop: 18,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent:
              'space-between',
            alignItems:
              'flex-end',
            gap: 14,
            flexWrap:
              'wrap',
          }}
        >
          <div>
            <h2
              style={{
                marginTop: 0,
                marginBottom: 6,
              }}
            >
              繳費機結班資料
            </h2>

            <div
              className="muted"
              style={{
                fontSize: 13,
              }}
            >
              每台繳費機分開輸入，系統會自動加總到整份結班報表，避免不同機台帳務混在一起。
            </div>
          </div>

          <div
            className="field"
            style={{
              minWidth: 180,
            }}
          >
            <label>
              本場繳費機台數
            </label>

            <select
              value={
                machines.length
              }
              disabled={
                machinesLoading
              }
              onChange={(
                event
              ) =>
                changeMachineCount(
                  num(
                    event.target
                      .value
                  )
                )
              }
            >
              {Array.from(
                {
                  length: 10,
                },
                (
                  _,
                  index
                ) => (
                  <option
                    key={
                      index + 1
                    }
                    value={
                      index + 1
                    }
                  >
                    {index + 1} 台
                  </option>
                )
              )}
            </select>
          </div>
        </div>

        {machinesLoading && (
          <div
            className="muted"
            style={{
              marginTop: 14,
            }}
          >
            正在讀取繳費機資料…
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gap: 14,
            marginTop: 16,
          }}
        >
          {machines.map(
            (
              machine,
              index
            ) => {
              const machineDigital =
                num(
                  machine.electronic_payment_total
                ) +
                num(
                  machine.mobile_payment_total
                )

              const machineCash =
                num(
                  machine.amount_paid
                ) -
                machineDigital -
                num(
                  machine.aps_monthly_amount
                )

              return (
                <div
                  key={
                    machine.machine_no
                  }
                  style={{
                    border:
                      '1px solid #e5e7eb',
                    borderRadius:
                      12,
                    padding: 14,
                    background:
                      '#f8fafc',
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
                      gap: 10,
                      marginBottom:
                        12,
                      flexWrap:
                        'wrap',
                    }}
                  >
                    <strong>
                      第 {index + 1} 台繳費機
                    </strong>

                    <span
                      className="muted"
                      style={{
                        fontSize:
                          13,
                      }}
                    >
                      臨停現金：$
                      {machineCash.toLocaleString()}
                    </span>
                  </div>

                  <div className="closing-grid">
                    <div className="field">
                      <label>
                        機台名稱／編號
                      </label>

                      <input
                        value={
                          machine.machine_name
                        }
                        onChange={(
                          event
                        ) =>
                          updateMachine(
                            index,
                            {
                              machine_name:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                        placeholder={`繳費機 ${index + 1}`}
                      />
                    </div>

                    <div className="field">
                      <label>
                        發票起號
                      </label>

                      <input
                        value={
                          machine.invoice_start_no
                        }
                        onChange={(
                          event
                        ) =>
                          updateMachine(
                            index,
                            {
                              invoice_start_no:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                      />
                    </div>

                    <div className="field">
                      <label>
                        發票訖號
                      </label>

                      <input
                        value={
                          machine.invoice_end_no
                        }
                        onChange={(
                          event
                        ) =>
                          updateMachine(
                            index,
                            {
                              invoice_end_no:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                      />
                    </div>

                    <div className="field">
                      <label>
                        應收總計
                      </label>

                      <input
                        type="number"
                        value={
                          machine.amount_due
                        }
                        onChange={(
                          event
                        ) =>
                          updateMachine(
                            index,
                            {
                              amount_due:
                                num(
                                  event
                                    .target
                                    .value
                                ),
                            }
                          )
                        }
                      />
                    </div>

                    <div className="field">
                      <label>
                        實收總計
                      </label>

                      <input
                        type="number"
                        value={
                          machine.amount_paid
                        }
                        onChange={(
                          event
                        ) =>
                          updateMachine(
                            index,
                            {
                              amount_paid:
                                num(
                                  event
                                    .target
                                    .value
                                ),
                            }
                          )
                        }
                      />
                    </div>

                    <div className="field">
                      <label>
                        APS 月租筆數
                      </label>

                      <input
                        type="number"
                        min={0}
                        value={
                          machine.aps_monthly_count
                        }
                        onChange={(
                          event
                        ) =>
                          updateMachine(
                            index,
                            {
                              aps_monthly_count:
                                num(
                                  event
                                    .target
                                    .value
                                ),
                            }
                          )
                        }
                      />
                    </div>

                    <div className="field">
                      <label>
                        APS 月租金額
                      </label>

                      <input
                        type="number"
                        value={
                          machine.aps_monthly_amount
                        }
                        onChange={(
                          event
                        ) =>
                          updateMachine(
                            index,
                            {
                              aps_monthly_amount:
                                num(
                                  event
                                    .target
                                    .value
                                ),
                            }
                          )
                        }
                      />
                    </div>

                    <div className="field">
                      <label>
                        電子支付（悠遊卡、一卡通）
                      </label>

                      <input
                        type="number"
                        value={
                          machine.electronic_payment_total
                        }
                        onChange={(
                          event
                        ) =>
                          updateMachine(
                            index,
                            {
                              electronic_payment_total:
                                num(
                                  event
                                    .target
                                    .value
                                ),
                            }
                          )
                        }
                      />
                    </div>

                    <div className="field">
                      <label>
                        手機支付（LINE PAY、街口、悠遊付）
                      </label>

                      <input
                        type="number"
                        value={
                          machine.mobile_payment_total
                        }
                        onChange={(
                          event
                        ) =>
                          updateMachine(
                            index,
                            {
                              mobile_payment_total:
                                num(
                                  event
                                    .target
                                    .value
                                ),
                            }
                          )
                        }
                      />
                    </div>

                    <div className="field">
                      <label>
                        電子＋手機支付
                      </label>

                      <input
                        type="number"
                        value={
                          machineDigital
                        }
                        readOnly
                      />
                    </div>

                    <div className="field">
                      <label>
                        本機臨停現金
                      </label>

                      <input
                        type="number"
                        value={
                          machineCash
                        }
                        readOnly
                      />

                      {machineCash < 0 && (
                        <div
                          style={{
                            color:
                              '#dc2626',
                            fontSize:
                              12,
                            marginTop:
                              4,
                          }}
                        >
                          本機現金為負數，請確認實收、電子支付、手機支付及月租金額。
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            }
          )}
        </div>

        <div
          style={{
            marginTop: 18,
            paddingTop: 16,
            borderTop:
              '1px solid #e5e7eb',
          }}
        >
          <h3
            style={{
              marginTop: 0,
              marginBottom: 12,
            }}
          >
            全部繳費機自動加總
          </h3>

          <div className="closing-grid">
            <div className="field">
              <label>
                應收總計
              </label>
              <input
                type="number"
                value={
                  amountDue
                }
                readOnly
              />
            </div>

            <div className="field">
              <label>
                實收總計
              </label>
              <input
                type="number"
                value={
                  amountPaid
                }
                readOnly
              />
            </div>

            <div className="field">
              <label>
                APS 月租總筆數
              </label>
              <input
                type="number"
                value={
                  apsMonthlyCount
                }
                readOnly
              />
            </div>

            <div className="field">
              <label>
                APS 本日月租金額
              </label>
              <input
                type="number"
                value={
                  apsMonthlyAmount
                }
                readOnly
              />
            </div>

            <div className="field">
              <label>
                電子支付總額
              </label>
              <input
                type="number"
                value={
                  electronicPaymentTotal
                }
                readOnly
              />
            </div>

            <div className="field">
              <label>
                手機支付總額
              </label>
              <input
                type="number"
                value={
                  mobilePaymentTotal
                }
                readOnly
              />
            </div>

            <div className="field">
              <label>
                電子支付＋手機支付總和
              </label>
              <input
                type="number"
                value={
                  digitalPaymentTotal
                }
                readOnly
              />
            </div>

            <div className="field">
              <label>
                全部繳費機臨停現金
              </label>
              <input
                type="number"
                value={
                  temporaryCashActual
                }
                readOnly
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{
          marginTop: 18,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent:
              'space-between',
            alignItems:
              'center',
            gap: 10,
            flexWrap:
              'wrap',
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
              }}
            >
              當日結班明細
            </h2>

            <div
              className="muted"
              style={{
                marginTop: 5,
                fontSize: 13,
              }}
            >
              第一筆臨停現金與月租現金會自動依上方結班金額計算。
            </div>
          </div>

          <button
            type="button"
            className="btn"
            onClick={
              addDetail
            }
          >
            ＋新增明細
          </button>
        </div>

        <div
          className="closing-table-wrap"
          style={{
            marginTop: 14,
          }}
        >
          <table
            style={{
              width: '100%',
              minWidth: 820,
              borderCollapse:
                'collapse',
            }}
          >
            <thead>
              <tr>
                <th>
                  當日結班開始日
                </th>
                <th>
                  當日結班結束日
                </th>
                <th>
                  臨停現金
                </th>
                <th>
                  月租現金
                </th>
                <th>
                  當日現金總計
                </th>
                <th>
                  操作
                </th>
              </tr>
            </thead>

            <tbody>
              {details.map(
                (
                  item,
                  index
                ) => (
                  <tr
                    key={
                      index
                    }
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
                      <input
                        type="date"
                        value={
                          item.detail_start_date
                        }
                        onChange={(
                          event
                        ) =>
                          updateDetail(
                            index,
                            {
                              detail_start_date:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                      />
                    </td>

                    <td
                      style={{
                        padding: 8,
                      }}
                    >
                      <input
                        type="date"
                        value={
                          item.detail_end_date
                        }
                        onChange={(
                          event
                        ) =>
                          updateDetail(
                            index,
                            {
                              detail_end_date:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                      />
                    </td>

                    <td
                      style={{
                        padding: 8,
                      }}
                    >
                      <input
                        type="number"
                        value={
                          item.temporary_cash
                        }
                        readOnly={
                          index === 0
                        }
                        onChange={(
                          event
                        ) => {
                          if (
                            index === 0
                          ) {
                            return
                          }

                          updateDetail(
                            index,
                            {
                              temporary_cash:
                                num(
                                  event
                                    .target
                                    .value
                                ),
                            }
                          )
                        }}
                      />
                    </td>

                    <td
                      style={{
                        padding: 8,
                      }}
                    >
                      <input
                        type="number"
                        value={
                          item.monthly_cash
                        }
                        readOnly={
                          index === 0
                        }
                        onChange={(
                          event
                        ) => {
                          if (
                            index === 0
                          ) {
                            return
                          }

                          updateDetail(
                            index,
                            {
                              monthly_cash:
                                num(
                                  event
                                    .target
                                    .value
                                ),
                            }
                          )
                        }}
                      />
                    </td>

                    <td
                      style={{
                        padding: 8,
                        fontWeight: 700,
                      }}
                    >
                      $
                      {(
                        num(
                          item.temporary_cash
                        ) +
                        num(
                          item.monthly_cash
                        )
                      ).toLocaleString()}
                    </td>

                    <td
                      style={{
                        padding: 8,
                      }}
                    >
                      <button
                        type="button"
                        disabled={
                          details.length <=
                          1
                        }
                        onClick={() =>
                          removeDetail(
                            index
                          )
                        }
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        <div
          style={{
            textAlign:
              'right',
            marginTop: 16,
            fontSize: 18,
            fontWeight: 800,
          }}
        >
          匯款總金額：$
          {remittanceTotal.toLocaleString()}
        </div>
      </div>

      <div
        className="card"
        style={{
          marginTop: 18,
        }}
      >
        <div className="field">
          <label>
            備註／異常說明
          </label>

          <textarea
            rows={4}
            value={
              notes
            }
            onChange={(
              event
            ) =>
              setNotes(
                event.target
                  .value
              )
            }
          />
        </div>
      </div>

      {message && (
        <div
          className="card"
          style={{
            marginTop: 18,
            color:
              '#dc2626',
          }}
        >
          {message}
        </div>
      )}

      {initialReport?.id && (
        <div
          className="card"
          style={{
            marginTop: 18,
            display: 'flex',
            justifyContent:
              'space-between',
            alignItems:
              'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              className="muted"
              style={{
                fontSize: 13,
                marginBottom: 4,
              }}
            >
              匯款狀態
            </div>

            <strong
              style={{
                color:
                  initialReport.remittance_status ===
                  'remitted'
                    ? '#15803d'
                    : '#b45309',
              }}
            >
              {initialReport.remittance_status ===
              'remitted'
                ? '已匯款'
                : '累積中'}
            </strong>

            {initialReport.remitted_at && (
              <div
                className="muted"
                style={{
                  marginTop: 4,
                  fontSize: 13,
                }}
              >
                匯款完成時間：
                {new Date(
                  initialReport.remitted_at
                ).toLocaleString(
                  'zh-TW'
                )}
              </div>
            )}
          </div>

          {initialReport.remittance_status !==
            'remitted' && (
            <button
              type="button"
              disabled={
                saving ||
                completingRemittance
              }
              onClick={
                completeRemittanceAndRestart
              }
              style={{
                border: 0,
                borderRadius: 10,
                padding:
                  '11px 16px',
                cursor:
                  completingRemittance
                    ? 'not-allowed'
                    : 'pointer',
                background:
                  '#15803d',
                color:
                  '#fff',
                fontWeight: 700,
              }}
            >
              {completingRemittance
                ? '處理中…'
                : '匯款完成，開始新一輪'}
            </button>
          )}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 10,
          marginTop: 18,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          className="btn"
          disabled={
            saving ||
            completingRemittance ||
            initialReport?.remittance_status ===
              'remitted'
          }
          onClick={
            save
          }
        >
          {initialReport?.remittance_status ===
          'remitted'
            ? '此輪已匯款'
            : saving
              ? '儲存中…'
              : '儲存結班報表'}
        </button>

        <button
          type="button"
          disabled={
            saving
          }
          onClick={() =>
            router.push(
              '/dashboard/shift-closing'
            )
          }
        >
          返回
        </button>
      </div>
    </div>
  )
}
