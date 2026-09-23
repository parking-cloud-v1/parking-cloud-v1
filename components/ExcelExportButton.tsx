'use client'

type Props = {
  rows: Record<string, any>[]
  parkingLotName?: string
}

function safeFileName(value: string) {
  const cleaned = String(value || '停車場')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')

  return cleaned || '停車場'
}

export default function ExcelExportButton({
  rows,
  parkingLotName = '停車場',
}: Props) {
  async function buildExcelFile() {
    if (!rows.length) {
      window.alert('目前沒有可匯出的月租資料。')
      return null
    }

    const XLSX = await import('xlsx')

    const translated = rows.map((row) => ({
      客戶編號: row.customer_code ?? '',
      姓名: row.customer_name ?? '',
      電話: row.phone ?? '',
      車牌: row.vehicle_plate ?? '',
      車種: row.vehicle_type ?? '',
      月租類型: row.rental_type ?? '',
      租期開始: row.start_date ?? '',
      租期結束: row.end_date ?? '',
      已繳至: row.paid_through_date ?? '',
      月租金額: Number(row.monthly_fee || 0),
      最近收款日期: row.payment_date ?? '',
      發票號碼: row.invoice_number ?? '',
      月租狀態: row.rental_status ?? '',
      資料來源: row.data_source ?? '',
      備註: row.notes ?? '',
    }))

    const ws = XLSX.utils.json_to_sheet(translated)
    const wb = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(
      wb,
      ws,
      '月租總表'
    )

    const dateText =
      new Date()
        .toISOString()
        .slice(0, 10)

    const fileName =
      `${safeFileName(parkingLotName)}_月租總表_${dateText}.xlsx`

    const arrayBuffer = XLSX.write(
      wb,
      {
        bookType: 'xlsx',
        type: 'array',
      }
    )

    return {
      file: new File(
        [arrayBuffer],
        fileName,
        {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }
      ),
      fileName,
      XLSX,
      workbook: wb,
    }
  }

  async function exportExcel() {
    const result =
      await buildExcelFile()

    if (!result) {
      return
    }

    result.XLSX.writeFile(
      result.workbook,
      result.fileName
    )
  }

  async function shareExcel() {
    const result =
      await buildExcelFile()

    if (!result) {
      return
    }

    try {
      if (
        typeof navigator.share !==
        'function'
      ) {
        window.alert(
          '目前瀏覽器不支援直接分享檔案，請使用手機 Chrome、Edge 或支援系統分享功能的瀏覽器。'
        )
        return
      }

      const shareData: ShareData = {
        files: [result.file],
        title: result.fileName,
      }

      if (
        typeof navigator.canShare ===
          'function' &&
        !navigator.canShare(
          shareData
        )
      ) {
        window.alert(
          '目前這個裝置不支援直接分享 Excel 檔案。'
        )
        return
      }

      await navigator.share(
        shareData
      )
    } catch (error: any) {
      if (
        error?.name !==
        'AbortError'
      ) {
        window.alert(
          'Excel 分享失敗：' +
            (
              error?.message ||
              '請稍後再試'
            )
        )
      }
    }
  }

  const buttonStyle = {
    padding: '9px 14px',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  } as const

  return (
    <>
      <button
        type="button"
        onClick={exportExcel}
        style={buttonStyle}
      >
        Excel 匯出
      </button>

      <button
        type="button"
        onClick={shareExcel}
        style={buttonStyle}
      >
        分享 Excel
      </button>
    </>
  )
}
