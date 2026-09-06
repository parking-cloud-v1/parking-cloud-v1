import { redirect } from 'next/navigation'

export default async function LegacyContractPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/contract-print/${encodeURIComponent(id)}`)
}
