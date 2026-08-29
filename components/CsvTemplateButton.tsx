'use client'

export default function CsvTemplateButton() {
  function downloadTemplate() {
    const csv =
      '\uFEFF停車場,車牌,付款狀態,收款日期,發票號碼\n' +
      '三重區五常公園地下停車場,ABC-1234,已繳,2026-08-27,AB12345678\n' +
      '三重區五常公園地下停車場,BBB-5678,未繳,,\n'

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    })

    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = '月租付款同步_CSV範本.csv'

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={downloadTemplate}
      style={{
        padding: '9px 14px',
        borderRadius: 8,
        border: '1px solid #cbd5e1',
        background: '#fff',
        cursor: 'pointer',
      }}
    >
      下載 CSV 範本
    </button>
  )
}