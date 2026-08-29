'use client'

import * as XLSX from 'xlsx'

type RentalExportRow = {
  customer_code?:
    | string
    | null

  customer_name?:
    | string
    | null

  phone?:
    | string
    | null

  vehicle_plate?:
    | string
    | null

  vehicle_type?:
    | string
    | null

  rental_type?:
    | string
    | null

  start_date?:
    | string
    | null

  end_date?:
    | string
    | null

  monthly_fee?:
    | number
    | null

  payment_status?:
    | string
    | null

  rental_status?:
    | string
    | null

  payment_date?:
    | string
    | null

  invoice_number?:
    | string
    | null

  notes?:
    | string
    | null
}

export default function ExcelExportButton({
  rentals,
  rows,
}: {
  rentals?: RentalExportRow[]
  rows?: RentalExportRow[]
}) {
  const exportData =
    rentals ??
    rows ??
    []

  function vehicleTypeText(
    value?:
      | string
      | null
  ) {
    if (
      value ===
      'car'
    ) {
      return '汽車'
    }

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

    return value || ''
  }

  function paymentText(
    value?:
      | string
      | null
  ) {
    if (
      value ===
      'paid'
    ) {
      return '已繳'
    }

    if (
      value ===
      'unpaid'
    ) {
      return '未繳'
    }

    return value || ''
  }

  function rentalStatusText(
    value?:
      | string
      | null
  ) {
    if (
      value ===
      'active'
    ) {
      return '使用中'
    }

    if (
      value ===
      'expired'
    ) {
      return '已到期'
    }

    if (
      value ===
      'cancelled'
    ) {
      return '已退租'
    }

    return value || ''
  }

  function exportExcel() {
    if (
      exportData.length ===
      0
    ) {
      alert(
        '目前沒有可以匯出的月租資料'
      )

      return
    }

    const excelRows =
      exportData.map(
        (item) => ({
          客戶編號:
            item.customer_code ||
            '',

          姓名:
            item.customer_name ||
            '',

          電話:
            item.phone ||
            '',

          車牌:
            item.vehicle_plate ||
            '',

          車種:
            vehicleTypeText(
              item.vehicle_type
            ),

          月租類型:
            item.rental_type ||
            '',

          起租日:
            item.start_date ||
            '',

          到期日:
            item.end_date ||
            '',

          月租金額:
            Number(
              item.monthly_fee ||
                0
            ),

          付款狀態:
            paymentText(
              item.payment_status
            ),

          月租狀態:
            rentalStatusText(
              item.rental_status
            ),

          收款日期:
            item.payment_date ||
            '',

          發票號碼:
            item.invoice_number ||
            '',

          備註:
            item.notes ||
            '',
        })
      )

    const worksheet =
      XLSX.utils.json_to_sheet(
        excelRows
      )

    worksheet[
      '!cols'
    ] = [
      {
        wch: 14,
      },
      {
        wch: 14,
      },
      {
        wch: 15,
      },
      {
        wch: 14,
      },
      {
        wch: 10,
      },
      {
        wch: 18,
      },
      {
        wch: 13,
      },
      {
        wch: 13,
      },
      {
        wch: 12,
      },
      {
        wch: 12,
      },
      {
        wch: 12,
      },
      {
        wch: 13,
      },
      {
        wch: 18,
      },
      {
        wch: 35,
      },
    ]

    const workbook =
      XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      '月租總表'
    )

    const today =
      new Date()
        .toISOString()
        .slice(
          0,
          10
        )

    XLSX.writeFile(
      workbook,
      `月租總表_${today}.xlsx`
    )
  }

  return (
    <button
      type="button"
      onClick={
        exportExcel
      }
      style={{
        padding:
          '9px 14px',
        borderRadius:
          8,
        border:
          '1px solid #cbd5e1',
        background:
          '#fff',
        cursor:
          'pointer',
      }}
    >
      匯出 Excel
    </button>
  )
}