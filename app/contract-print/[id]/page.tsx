import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import OnePageContractSheet from '@/components/OnePageContractSheet'

export const metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

export default async function ContractPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: row, error } = await supabase
    .from('contracts')
    .select(`
      id, contract_snapshot, status, signed_at,
      contract_signatures(signer_name,handwritten_signature_at,signed_at)
    `)
    .eq('id', id)
    .maybeSingle()

  if (error || !row) notFound()

  const signature = Array.isArray(row.contract_signatures)
    ? row.contract_signatures[0]
    : row.contract_signatures

  return (
    <main style={{ minHeight: '100vh' }}>
      <div
        className="contract-print-toolbar"
        style={{
          width: 'min(210mm, calc(100% - 24px))',
          margin: '16px auto 0',
          display: 'flex',
          gap: 12,
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          fontFamily:
            '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif',
        }}
      >
        <Link href={`/dashboard/online/contracts/${row.id}`}>
          ← 返回契約資料
        </Link>
        <span style={{ color: '#64748b', fontSize: 13 }}>
          列印視窗會自動開啟；版面固定為 A4 一頁。
        </span>
      </div>

      <OnePageContractSheet
        contractSnapshot={String(row.contract_snapshot || '')}
        signerName={signature?.signer_name || null}
        signedAt={signature?.signed_at || row.signed_at || null}
        signatureUrl={
          row.status === 'signed' && signature?.handwritten_signature_at
            ? `/api/admin/online-contracts/signature/${row.id}`
            : null
        }
        autoPrint
      />
    </main>
  )
}
