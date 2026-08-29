'use client'

import * as XLSX from 'xlsx'

type ChangeRow = {
  parking_lot_name: string
  customer_code: string
  customer_name: string
  phone: string
  vehicle_plate: string
  vehicle_type: string
  rental_type: string

  change_type: string
  effective_date: string

  reason: string
  change_detail: string
  source: string
}

export default function RentalChangesExportButton({
  rows,
}: {
  rows: ChangeRow[]
}) {
  function vehicleTypeText(
    value: string
  ) {
    if (value === 'car') {
      return '汽車'
    }

    if (value === 'motorcycle') {
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

  function changeTypeText(
    value: string
  ) {
    if (value === 'joined') {
      return '新增'
    }

    if (
      value ===
      'cancelled'
    ) {
      return '退租'
    }

    if (
      value ===
      'updated'
    ) {
      return '資料異動'
    }

    return value
  }

  function sourceText(
    value: string
  ) {
    if (
      value ===
      'legacy_import'
    ) {
      return '總表匯入'
    }

    if (
      value ===
      'monthly_rentals'
    ) {
      return '月租管理'
    }

    if (
      value ===
      'annual_roster'
    ) {
      return '年度抽籤'
    }

    return value || ''
  }

  function exportExcel() {
    if (
      rows.length === 0
    ) {
      alert(
        '目前沒有可以匯出的異動資料'
      )

      return
    }

    const data =
      rows.map(
        (item) => ({
          異動日期:
            item.effective_date,

          異動類型:
            changeTypeText(
              item.change_type
            ),

          停車場:
            item.parking_lot_name,

          客戶編號:
            item.customer_code,

          姓名:
            item.customer_name,

          電話:
            item.phone,

          車牌:
            item.vehicle_plate,

          車種:
            vehicleTypeText(
              item.vehicle_type
            ),

          月租類型:
            item.rental_type,

          異動內容:
            item.change_detail,

          原因:
            item.reason,

          來源:
            sourceText(
              item.source
            ),
        })
      )

    const worksheet =
      XLSX.utils.json_to_sheet(
        data
      )

    worksheet['!cols'] = [
      { wch: 13 },
      { wch: 12 },
      { wch: 28 },
      { wch: 14 },
      { wch: 14 },
      { wch: 15 },
      { wch: 14 },
      { wch: 10 },
      { wch: 18 },
      { wch: 35 },
      { wch: 25 },
      { wch: 15 },
    ]

    const workbook =
      XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      '月租簽約異動'
    )

    const today =
      new Date()
        .toISOString()
        .slice(0, 10)

    XLSX.writeFile(
      workbook,
      `月租簽約異動_${today}.xlsx`
    )
  }

  return (
    <button
      type="button"
      className="btn"
      onClick={
        exportExcel
      }
    >
      匯出會計異動 Excel
    </button>
  )
}