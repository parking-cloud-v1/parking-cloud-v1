import Link from 'next/link'
import {
  redirect,
} from 'next/navigation'

import {
  createClient,
} from '@/lib/supabase/server'

export default async function OnsiteWorkPage() {
  const supabase =
    await createClient()

  const {
    data: {
      user,
    },
  } =
    await supabase
      .auth
      .getUser()

  if (!user) {
    redirect(
      '/login'
    )
  }

  return (
    <div
      style={{
        paddingBottom:
          40,
      }}
    >
      <h1
        style={{
          marginTop:
            0,

          marginBottom:
            6,
        }}
      >
        現場作業
      </h1>

      <p
        className="muted"
        style={{
          marginTop:
            0,
        }}
      >
        停車場現場勤務、結班、防災及優惠作業集中管理。
      </p>

      <div
        style={{
          display:
            'grid',

          gridTemplateColumns:
            'repeat(auto-fit, minmax(230px, 1fr))',

          gap:
            16,

          marginTop:
            24,
        }}
      >
        <Link
          href="/dashboard/shift-closing"
          className="card"
          style={{
            textDecoration:
              'none',

            color:
              'inherit',
          }}
        >
          <div
            style={{
              fontSize:
                13,

              color:
                '#15803d',

              fontWeight:
                700,
            }}
          >
            結班
          </div>

          <h2>
            當日結班報表
          </h2>

          <p className="muted">
            結班營收、現金、電子支付及匯款資料。
          </p>
        </Link>

        <Link
          href="/dashboard/disaster-inspections"
          className="card"
          style={{
            textDecoration:
              'none',

            color:
              'inherit',
          }}
        >
          <div
            style={{
              fontSize:
                13,

              color:
                '#15803d',

              fontWeight:
                700,
            }}
          >
            防災
          </div>

          <h2>
            防災檢查
          </h2>

          <p className="muted">
            颱風、豪大雨及相關現場防災檢查。
          </p>
        </Link>

        <Link
          href="/dashboard/taxi-discounts"
          className="card"
          style={{
            textDecoration:
              'none',

            color:
              'inherit',
          }}
        >
          <div
            style={{
              fontSize:
                13,

              color:
                '#15803d',

              fontWeight:
                700,
            }}
          >
            優惠
          </div>

          <h2>
            計程車折扣
          </h2>

          <p className="muted">
            計程車優惠計算及每日統計紀錄。
          </p>
        </Link>
      </div>

      <div
        className="card"
        style={{
          marginTop:
            24,
        }}
      >
        <h2
          style={{
            marginTop:
              0,
          }}
        >
          現場作業說明
        </h2>

        <p
          className="muted"
          style={{
            lineHeight:
              1.8,
          }}
        >
          本區只放與停車場現場勤務直接相關的功能。
          月租線上申請、候補、電子簽約及個資驗證不會放在本區。
        </p>
      </div>
    </div>
  )
}