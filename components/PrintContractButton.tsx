'use client'

export default function PrintContractButton({
  label = '列印',
}: {
  label?: string
}) {
  return (
    <button
      type="button"
      className="no-print"
      onClick={() => window.print()}
      style={{
        padding: '10px 16px',
        borderRadius: 8,
        border: '1px solid #94a3b8',
        background: '#fff',
        cursor: 'pointer',
        fontWeight: 700,
      }}
    >
      {label}
    </button>
  )
}
