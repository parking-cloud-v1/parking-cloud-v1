import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import LegacyMonthlyImport from '@/components/LegacyMonthlyImport'
import ImportBatchManager from '@/components/ImportBatchManager'

export default async function LegacyMonthlyImportPage() {
  const supabase =
    await createClient()

  const {
    data: {
      user,
    },
  } =
    await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const {
    data:
      profile,
  } =
    await supabase
      .from(
        'profiles'
      )
      .select(
        'id, is_active'
      )
      .eq(
        'id',
        user.id
      )
      .maybeSingle()

  if (
    !profile ||
    !profile.is_active
  ) {
    redirect('/login')
  }

  const {
    data:
      parkingLots,

    error:
      parkingLotsError,
  } =
    await supabase
      .from(
        'parking_lots'
      )
      .select(
        'id, name, status'
      )
      .eq(
        'status',
        'active'
      )
      .order(
        'name'
      )

  const {
    data:
      batches,

    error:
      batchError,
  } =
    await supabase
      .from(
        'monthly_import_batches'
      )
      .select(`
        id,
        parking_lot_id,
        file_name,
        total_rows,
        inserted_rows,
        updated_rows,
        cancelled_rows,
        status,
        imported_at,
        rolled_back_at,
        parking_lots (
          name
        )
      `)
      .eq(
        'import_type',
        'legacy_roster'
      )
      .order(
        'imported_at',
        {
          ascending:
            false,
        }
      )
      .limit(
        50
      )

  return (
    <div>
      <div
        style={{
          display:
            'flex',
          justifyContent:
            'space-between',
          alignItems:
            'center',
          gap:
            16,
          flexWrap:
            'wrap',
          marginBottom:
            24,
        }}
      >
        <div>
          <h1
            style={{
              marginBottom:
                6,
            }}
          >
            匯入舊系統月租總表
          </h1>

          <p
            className="muted"
            style={{
              marginTop:
                0,
            }}
          >
            匯入後會保存批次，第二次以後會自動比對新增、退租與資料異動。
          </p>
        </div>

        <Link
          href="/dashboard/monthly-rentals"
          style={{
            textDecoration:
              'none',
            color:
              '#475569',
          }}
        >
          ← 返回月租管理
        </Link>
      </div>

      {parkingLotsError && (
        <div
          className="card"
          style={{
            color:
              '#b91c1c',
            marginBottom:
              20,
          }}
        >
          停車場讀取失敗：
          {
            parkingLotsError.message
          }
        </div>
      )}

      {!parkingLots ||
      parkingLots.length ===
        0 ? (
        <div className="card">
          <h2>
            無法匯入
          </h2>

          <p className="muted">
            目前沒有可管理的停車場。
          </p>
        </div>
      ) : (
        <LegacyMonthlyImport
          parkingLots={
            parkingLots.map(
              (
                lot: any
              ) => ({
                id:
                  lot.id,

                name:
                  lot.name,
              })
            )
          }
        />
      )}

      {batchError && (
        <div
          className="card"
          style={{
            marginTop:
              24,
            color:
              '#b91c1c',
          }}
        >
          匯入紀錄讀取失敗：
          {
            batchError.message
          }
        </div>
      )}

      <ImportBatchManager
        batches={
          (batches as any[]) ||
          []
        }
      />
    </div>
  )
}