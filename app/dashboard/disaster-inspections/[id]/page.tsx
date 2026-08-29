import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DisasterInspectionEditor from '@/components/DisasterInspectionEditor'

export default async function DisasterInspectionDetailPage({
  params,
}: {
  params: Promise<{
    id: string
  }>
}) {
  const { id } = await params

  const supabase =
    await createClient()

  const {
    data: { user },
  } =
    await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <DisasterInspectionEditor
      inspectionId={id}
    />
  )
}