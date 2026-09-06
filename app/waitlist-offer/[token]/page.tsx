import PublicWaitlistOfferClient from '@/components/PublicWaitlistOfferClient'

export default async function PublicWaitlistOfferPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <PublicWaitlistOfferClient token={token} />
}
