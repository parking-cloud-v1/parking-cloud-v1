'use client'

export default function ExcelExportButton({ rows }: { rows: Record<string, any>[] }) {
  async function exportExcel() {
    if (!rows.length) {
      window.alert('目前沒有可匯出的月租資料。')
      return
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
      繳費月份: row.payment_month ?? '',
      月租金額: Number(row.monthly_fee || 0),
      最近收款日期: row.payment_date ?? '',
      發票號碼: row.invoice_number ?? '',
      月租狀態: row.rental_status ?? '',
      資料來源: row.data_source ?? '',
      備註: row.notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(translated)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '月租總表')
    XLSX.writeFile(wb, `月租總表_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <button type="button" onClick={exportExcel} style={{ padding: '9px 14px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
      Excel 匯出
    </button>
  )
}
