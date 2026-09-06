import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import UserPermissionEditor from '@/components/UserPermissionEditor'
import CreateUserForm from '@/components/CreateUserForm'
import OnlineOperationsAccessManager from '@/components/OnlineOperationsAccessManager'

export default async function SettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'supervisor') {
    redirect('/dashboard')
  }

  const { data: users } = await supabase
    .from('profiles')
    .select(`
      id,
      display_name,
      role,
      is_active,
      user_parking_lots (
        parking_lot_id
      )
    `)
    .order('created_at', { ascending: true })

  const { data: parkingLots } = await supabase
    .from('parking_lots')
    .select('id, name, status')
    .order('name')

  const { data: onlineAccessRows } = await supabase
    .from('parking_lot_online_operation_access')
    .select('parking_lot_id,is_enabled,open_from,open_until,note')
    .order('updated_at', { ascending: false })

  const normalizedUsers =
    users?.map((item: any) => ({
      id: item.id,
      display_name: item.display_name,
      role: item.role,
      is_active: item.is_active,
      assigned_lot_ids:
        item.user_parking_lots?.map(
          (row: any) => row.parking_lot_id
        ) || [],
    })) || []

  return (
    <div>
      <h1>系統設定</h1>
      <p className="muted">
        帳號、角色與停車場權限管理
      </p>

      <div className="card" style={{ marginTop: 24 }}>
        <h2>新增使用者</h2>
        <p className="muted">
          建立主管、場站管理員或會計帳號。會計登入後只會看到報表中心。
        </p>
        <CreateUserForm parkingLots={parkingLots || []} />
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h2>帳號權限管理</h2>
        <p className="muted">
          主管可以修改角色、帳號狀態以及場站管理員可管理的停車場；會計不分配現場停車場，只使用報表中心。
        </p>

        {!normalizedUsers.length ? (
          <p className="muted">目前沒有帳號資料。</p>
        ) : (
          <div style={{ marginTop: 16 }}>
            {normalizedUsers.map((item: any) => (
              <UserPermissionEditor
                key={item.id}
                user={item}
                parkingLots={parkingLots || []}
                currentUserId={user.id}
              />
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h2>現場線上作業開放</h2>
        <p className="muted">
          主管決定各停車場何時開放「線上作業」給場站管理員。未開放時，現場左側選單不顯示線上作業，直接輸入網址也無法使用。
        </p>
        <OnlineOperationsAccessManager
          parkingLots={parkingLots || []}
          initialRows={(onlineAccessRows || []) as any}
        />
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h2>目前停車場</h2>

        {!parkingLots || parkingLots.length === 0 ? (
          <p className="muted">目前尚未建立停車場。</p>
        ) : (
          <div style={{ marginTop: 16 }}>
            {parkingLots.map((lot: any) => (
              <div
                key={lot.id}
                style={{
                  padding: '12px 0',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <strong>{lot.name}</strong>

                <span
                  style={{
                    color:
                      lot.status === 'active'
                        ? '#166534'
                        : '#64748b',
                  }}
                >
                  {lot.status === 'active'
                    ? '啟用中'
                    : '停用'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
