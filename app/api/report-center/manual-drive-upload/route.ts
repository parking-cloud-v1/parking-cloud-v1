import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadToGoogleDrive } from '@/lib/google-drive'

type Category =
  | 'attendance'
  | 'rentals'
  | 'changes'
  | 'taxi'
  | 'shift'
  | 'disaster'
  | 'dengue'
  | 'violation'

const CATEGORIES: Category[] = [
  'attendance', 'rentals', 'changes', 'taxi', 'shift', 'disaster', 'dengue', 'violation',
]

function folderIdFromUrl(value: string) {
  const source = String(value || '').trim()
  if (!/^https:\/\/drive\.google\.com\//i.test(source)) return ''

  const folderMatch = source.match(/\/folders\/([a-zA-Z0-9_-]+)/i)
  if (folderMatch?.[1]) return folderMatch[1]

  try {
    const url = new URL(source)
    return url.searchParams.get('id') || ''
  } catch {
    return ''
  }
}

async function authorize() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, profile: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  return { user, profile }
}

export async function POST(request: Request) {
  try {
    const { user, profile } = await authorize()

    if (!user || !profile?.is_active || !['supervisor', 'manager'].includes(String(profile.role))) {
      return NextResponse.json({ error: '沒有報表中心上傳權限。' }, { status: 403 })
    }

    const form = await request.formData()
    const file = form.get('file')
    const category = String(form.get('category') || '') as Category
    const month = String(form.get('month') || '').trim()
    const folderUrl = String(form.get('folderUrl') || '').trim()

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '沒有收到要上傳的報表檔案。' }, { status: 400 })
    }

    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ error: '上傳類型錯誤。' }, { status: 400 })
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: '月份格式錯誤。' }, { status: 400 })
    }

    const folderId = folderIdFromUrl(folderUrl)
    if (!folderId) {
      return NextResponse.json({ error: 'Google Drive 資料夾連結無法辨識，請重新設定該類資料夾連結。' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const uploaded = await uploadToGoogleDrive({
      folderId,
      fileName: file.name,
      mimeType: file.type || 'application/zip',
      bytes,
    })

    return NextResponse.json({
      ok: true,
      category,
      month,
      fileName: uploaded.name || file.name,
      googleFileId: uploaded.id,
      webViewLink: uploaded.webViewLink || null,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Google Drive 上傳失敗。' },
      { status: 500 }
    )
  }
}
