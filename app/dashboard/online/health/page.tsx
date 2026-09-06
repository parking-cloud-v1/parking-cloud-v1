import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import admin from '@/components/OnlineAdmin.module.css'

type CheckStatus = 'pass' | 'warning' | 'fail'

type HealthCheck = {
  group: string
  name: string
  status: CheckStatus
  message: string
}

function statusText(status: CheckStatus) {
  if (status === 'pass') return '正常'
  if (status === 'warning') return '需確認'
  return '異常'
}

function statusColor(status: CheckStatus) {
  if (status === 'pass') return '#15803d'
  if (status === 'warning') return '#b45309'
  return '#b91c1c'
}

function safeHostname(value?: string | null) {
  if (!value) return ''
  try {
    return new URL(value).hostname
  } catch {
    return ''
  }
}

export default async function OnlineHealthPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'supervisor') {
    redirect('/dashboard/online/audit')
  }

  const checks: HealthCheck[] = []
  const add = (
    group: string,
    name: string,
    status: CheckStatus,
    message: string
  ) => checks.push({ group, name, status, message })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const otpSecret = process.env.OTP_HASH_SECRET || ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || ''
  const otpDevMode = process.env.OTP_DEV_MODE === 'true'
  const smsApiUrl = process.env.SMS_API_URL || ''
  const smsApiToken = process.env.SMS_API_TOKEN || ''
  const smsApiTimeout = process.env.SMS_API_TIMEOUT_MS || '10000'
  const smsApiRetries = process.env.SMS_API_RETRIES || '1'

  add(
    '環境變數',
    'Supabase URL',
    supabaseUrl ? 'pass' : 'fail',
    supabaseUrl ? '已設定。' : '缺少 NEXT_PUBLIC_SUPABASE_URL。'
  )
  add(
    '環境變數',
    'Supabase Anon Key',
    anonKey ? 'pass' : 'fail',
    anonKey ? '已設定。' : '缺少 NEXT_PUBLIC_SUPABASE_ANON_KEY。'
  )
  add(
    '環境變數',
    'Supabase Service Role Key',
    serviceKey ? 'pass' : 'fail',
    serviceKey ? 'Server 端已設定；本頁不顯示金鑰內容。' : '缺少 SUPABASE_SERVICE_ROLE_KEY。'
  )
  const otpSecretReady = otpSecret.length >= 32 && otpSecret !== serviceKey
  add(
    '環境變數',
    'OTP Hash Secret',
    otpSecretReady ? 'pass' : 'fail',
    otpSecret.length < 32
      ? 'OTP_HASH_SECRET 未設定或少於 32 字元。'
      : otpSecret === serviceKey
        ? 'OTP_HASH_SECRET 不可與 SUPABASE_SERVICE_ROLE_KEY 相同，請建立獨立 Secret。'
        : '已設定獨立 OTP Secret，且長度符合至少 32 字元要求。'
  )

  const hostname = safeHostname(appUrl)
  if (!appUrl) {
    add('正式網址', 'APP / SITE URL', 'fail', '尚未設定 NEXT_PUBLIC_APP_URL 或 NEXT_PUBLIC_SITE_URL。')
  } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
    add('正式網址', 'APP / SITE URL', 'warning', '目前仍是 localhost；本機測試可用，正式上線前需換成正式網域。')
  } else if (!appUrl.startsWith('https://')) {
    add('正式網址', 'HTTPS', 'warning', '正式網址不是 https://；電子簽約正式上線建議使用 HTTPS。')
  } else {
    add('正式網址', 'APP / SITE URL', 'pass', '已設定正式 HTTPS 網址。')
  }

  add(
    '簡訊 / OTP',
    'OTP_DEV_MODE',
    otpDevMode ? 'warning' : 'pass',
    otpDevMode
      ? '目前為 true，只適合測試；正式上線前請改為 false。'
      : '已關閉開發 OTP 顯示。'
  )

  add(
    '正式上線',
    'Node 環境',
    process.env.NODE_ENV === 'production' ? 'pass' : 'warning',
    process.env.NODE_ENV === 'production'
      ? '目前為 production 模式。'
      : '目前不是 production；Preview / 本機測試可接受，正式網域部署需為 production。'
  )

  if (otpDevMode) {
    add('簡訊 / OTP', 'SMS Provider', 'warning', '開發模式中，可暫時不設定正式簡訊商。')
  } else {
    add(
      '簡訊 / OTP',
      'SMS Provider',
      smsApiUrl && smsApiToken ? 'pass' : 'fail',
      smsApiUrl && smsApiToken
        ? `SMS_API_URL 與 SMS_API_TOKEN 已設定；timeout=${smsApiTimeout}ms，retries=${smsApiRetries}。`
        : '正式模式缺少 SMS_API_URL 或 SMS_API_TOKEN。'
    )
  }

  let serviceAdmin: any = null
  if (supabaseUrl && serviceKey) {
    serviceAdmin = createSupabaseClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })

    const { error } = await serviceAdmin.from('parking_lots').select('id').limit(1)
    add(
      '資料庫',
      'Service Role 連線',
      error ? 'fail' : 'pass',
      error ? `Server 連線失敗：${error.message}` : 'Service Role 可正常存取資料庫。'
    )
  } else {
    add('資料庫', 'Service Role 連線', 'fail', '環境變數不完整，無法執行 Server 資料庫檢查。')
  }

  const requiredTables = [
    ['rental_applications', '線上申請', 'id'],
    ['contracts', '電子契約', 'id'],
    ['contract_signatures', '電子簽署', 'id'],
    ['online_audit_logs', '操作紀錄', 'id'],
    ['online_application_settings', '申請開放設定', 'parking_lot_id'],
    ['online_reminder_settings', '提醒設定', 'parking_lot_id'],
    ['online_reminder_logs', '提醒紀錄', 'id'],
    ['online_application_reviews', '審核歷程', 'id'],
    ['contract_lifecycle_events', '契約生命週期', 'id'],
    ['monthly_waiting_list', '月租候補', 'id'],
    ['monthly_rentals', '月租主檔', 'id'],
    ['online_capacity_reservations', '月租名額保留', 'id'],
    ['signed_contract_archives', '已簽契約正式留存', 'id'],
  ] as const

  if (serviceAdmin) {
    for (const [table, label, keyColumn] of requiredTables) {
      const { error } = await serviceAdmin.from(table).select(keyColumn).limit(1)
      add(
        '資料庫',
        label,
        error ? 'fail' : 'pass',
        error ? `${table} 無法讀取：${error.message}` : `${table} 可正常讀取。`
      )
    }

    const { error: phase16Error } = await serviceAdmin
      .from('online_audit_logs')
      .select('id,result,source,error_message,request_id')
      .limit(1)

    add(
      '資料庫',
      '第十六階段 SQL',
      phase16Error ? 'fail' : 'pass',
      phase16Error
        ? '找不到第十六階段稽核欄位，請確認 online_contract_phase16.sql 已執行。'
        : '第十六階段稽核欄位已存在。'
    )


    const { error: phase17Error } = await serviceAdmin
      .from('online_application_settings')
      .select(
        'parking_lot_id,monthly_capacity_car,monthly_capacity_motorcycle,monthly_capacity_heavy_motorcycle,auto_waitlist_when_full'
      )
      .limit(1)

    add(
      '資料庫',
      '第十七階段名額控管',
      phase17Error ? 'fail' : 'pass',
      phase17Error
        ? '找不到第十七階段名額欄位，請確認 online_contract_phase17.sql 已執行。'
        : '月租名額欄位與自動候補設定已存在。'
    )


    const { error: finalUpdateError } = await serviceAdmin
      .from('online_reminder_settings')
      .select(
        'parking_lot_id,renewal_reminder_days,renewal_repeat_days,renewal_expired_grace_days,renewal_batch_limit'
      )
      .limit(1)

    add(
      '資料庫',
      '最終整合更新',
      finalUpdateError ? 'fail' : 'pass',
      finalUpdateError
        ? '找不到續租提醒整合欄位，請執行 online_contract_final_update.sql。'
        : '續租提醒、批次邀請與最終整合欄位已存在。'
    )

    const { error: phase22Error } = await serviceAdmin
      .from('contract_signatures')
      .select('id,electronic_signature_consent_at')
      .limit(1)

    add(
      '資料庫',
      '電子簽章明確同意',
      phase22Error ? 'fail' : 'pass',
      phase22Error
        ? '找不到電子簽章明確同意欄位，請執行 online_contract_phase22_electronic_signature_consent.sql。'
        : '電子簽章方式明確同意欄位已存在。'
    )


    const phaseChecks = [
      ['parking_lot_rental_terms', '第23階段正式租期', 'id,parking_lot_id,start_date,end_date'],
      ['monthly_rental_payment_months', '第23階段繳費月份', 'id,monthly_rental_id,payment_month'],
      ['monthly_rental_term_changes', '第23階段租期異動', 'id,monthly_rental_id'],
      ['parking_lot_online_operation_access', '第25階段線上作業開放', 'parking_lot_id,is_enabled,open_from,open_until'],
      ['dengue_prevention_photos', '第25階段登革熱報表', 'id,parking_lot_id,work_type,file_kind,storage_path'],
      ['shift_closing_machines', '第27階段多台繳費機', 'id,report_id,machine_no,machine_name'],
      ['public_api_rate_limits', '第28階段公開 API 防濫用', 'scope,key_hash,window_start,hits'],
    ] as const

    for (const [table, label, columns] of phaseChecks) {
      const { error } = await serviceAdmin.from(table).select(columns).limit(1)
      add(
        '版本完整性',
        label,
        error ? 'fail' : 'pass',
        error ? `${table} 缺少或欄位不完整，請確認對應階段 SQL 已執行。` : `${table} 已就緒。`
      )
    }

    const { error: phase26Error } = await serviceAdmin
      .from('signed_contract_archives')
      .select(
        'id,pdf_path,pdf_hash,pdf_generated_at,pdf_upload_token_hash,pdf_upload_token_expires_at,pdf_upload_token_used_at'
      )
      .limit(1)

    add(
      '版本完整性',
      '第26／28階段正式 PDF 留存',
      phase26Error ? 'fail' : 'pass',
      phase26Error
        ? '正式 PDF 留存或一次性上傳權杖欄位尚未完整，請確認第26與第28階段 SQL。'
        : '正式 PDF 留存與一次性上傳權杖欄位已就緒。'
    )

    const { error: rateRpcError } = await serviceAdmin.rpc(
      'consume_public_rate_limit',
      {
        p_scope: 'health_check',
        p_key_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        p_window_seconds: 60,
        p_limit: 10000,
      }
    )

    add(
      '安全控制',
      '公開 API Rate Limit RPC',
      rateRpcError ? 'fail' : 'pass',
      rateRpcError
        ? 'consume_public_rate_limit RPC 無法使用，請執行第28階段 SQL。'
        : '公開 OTP／申請／簽約可使用資料庫層防濫用計數。'
    )

    const { data: buckets, error: bucketError } = await serviceAdmin.storage.listBuckets()
    if (bucketError) {
      add('安全控制', 'Private Storage', 'fail', '無法讀取 Storage bucket 設定。')
    } else {
      const signatureBucket = (buckets || []).find((bucket: any) => bucket.id === 'contract-handwritten-signatures')
      const pdfBucket = (buckets || []).find((bucket: any) => bucket.id === 'contract-signed-pdfs')

      add(
        '安全控制',
        '手寫簽名 Private Bucket',
        signatureBucket && signatureBucket.public === false ? 'pass' : 'fail',
        signatureBucket
          ? signatureBucket.public === false
            ? '手寫簽名 bucket 為 private。'
            : '手寫簽名 bucket 目前為 public，正式上線前必須修正。'
          : '找不到 contract-handwritten-signatures bucket。'
      )
      add(
        '安全控制',
        '正式 PDF Private Bucket',
        pdfBucket && pdfBucket.public === false ? 'pass' : 'fail',
        pdfBucket
          ? pdfBucket.public === false
            ? '正式 PDF bucket 為 private。'
            : '正式 PDF bucket 目前為 public，正式上線前必須修正。'
          : '找不到 contract-signed-pdfs bucket。'
      )
    }
  }

  if (supabaseUrl && anonKey) {
    const anon = createSupabaseClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    })

    const sensitiveTables = [
      ['public_otp_challenges', 'OTP 挑戰資料'],
      ['rental_applications', '線上申請個資'],
      ['contracts', '契約資料'],
      ['contract_signatures', '簽署資料'],
      ['online_audit_logs', '操作紀錄'],
      ['online_capacity_reservations', '名額保留資料'],
      ['signed_contract_archives', '正式契約留存資料'],
    ] as const

    for (const [table, label] of sensitiveTables) {
      const { error } = await anon.from(table).select('id').limit(1)
      add(
        '公開權限',
        label,
        error ? 'pass' : 'fail',
        error
          ? '匿名使用者無法直接 SELECT，符合 Server API / RLS 設計。'
          : `匿名使用者可直接讀取 ${table}；正式上線前需修正 anon grant / RLS。`
      )
    }
  } else {
    add('公開權限', '匿名存取檢查', 'fail', 'Supabase 公開環境變數不完整，無法測試 anon 權限。')
  }

  const { data: accessibleLots, error: lotsError } = await supabase
    .from('parking_lots')
    .select('id,name,status')
    .order('name')

  add(
    '帳號權限',
    '主管帳號',
    profile?.role === 'supervisor' ? 'pass' : 'fail',
    profile?.role === 'supervisor' ? '目前帳號為 supervisor。' : '目前帳號不是 supervisor。'
  )
  add(
    '帳號權限',
    '場站讀取',
    lotsError ? 'fail' : 'pass',
    lotsError
      ? `停車場權限讀取失敗：${lotsError.message}`
      : `目前帳號可讀取 ${(accessibleLots || []).length} 個停車場。`
  )

  if (serviceAdmin) {
    const { data: openSettings, error } = await serviceAdmin
      .from('online_application_settings')
      .select('parking_lot_id,enabled,starts_at,ends_at')
      .eq('enabled', true)

    add(
      '營運設定',
      '公開申請場站',
      error ? 'warning' : 'pass',
      error
        ? `無法讀取申請設定：${error.message}`
        : `目前有 ${(openSettings || []).length} 個場站設定為開放線上申請。`
    )

    const { count: syncIssueCount, error: syncIssueError } = await serviceAdmin
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'signed')
      .in('monthly_sync_status', ['conflict', 'error'])

    add(
      '營運設定',
      '月租同步異常',
      syncIssueError ? 'warning' : (syncIssueCount || 0) > 0 ? 'warning' : 'pass',
      syncIssueError
        ? `無法檢查同步狀態：${syncIssueError.message}`
        : (syncIssueCount || 0) > 0
          ? `目前仍有 ${syncIssueCount} 筆已簽契約需要處理月租同步異常。`
          : '目前沒有已簽契約的月租同步衝突／失敗。'
    )


    const { count: missingPdfCount, error: missingPdfError } = await serviceAdmin
      .from('signed_contract_archives')
      .select('id', { count: 'exact', head: true })
      .is('pdf_path', null)

    add(
      '營運設定',
      '已簽合約 PDF 留存',
      missingPdfError ? 'warning' : (missingPdfCount || 0) > 0 ? 'warning' : 'pass',
      missingPdfError
        ? '無法統計正式 PDF 留存狀態。'
        : (missingPdfCount || 0) > 0
          ? `目前有 ${missingPdfCount} 筆舊封存尚無正式 PDF；舊資料仍保留原封存，新簽約需確認會自動產生 PDF。`
          : '目前正式封存皆已有 PDF 留存。'
    )
  }

  const failCount = checks.filter((check) => check.status === 'fail').length
  const warningCount = checks.filter((check) => check.status === 'warning').length
  const passCount = checks.filter((check) => check.status === 'pass').length
  const overall = failCount > 0 ? 'fail' : warningCount > 0 ? 'warning' : 'pass'
  const groups = Array.from(new Set(checks.map((check) => check.group)))

  return (
    <div className={admin.page}>
      <div className={admin.headerPanel}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: 6 }}>正式上線安全檢查</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            僅主管可查看。只顯示「是否已設定／是否可存取」，不會顯示任何 Secret、OTP 或 Token 原文。
          </p>
        </div>
        <div className={admin.headerActions}>
          <Link href="/dashboard/online/audit">操作紀錄</Link>
          <Link href="/dashboard/online/reports">營運報表</Link>
          <Link href="/dashboard/online/capacity">名額控管</Link>
          <Link href="/dashboard/online/renewal-reminders">續租提醒</Link>
          <Link href="/dashboard/online/reminders">待辦提醒</Link>
        </div>
      </div>

      <div
        className="card"
        style={{
          marginTop: 20,
          border: `1px solid ${statusColor(overall)}`,
        }}
      >
        <div className="muted">整體狀態</div>
        <strong style={{ fontSize: 26, color: statusColor(overall) }}>
          {overall === 'pass'
            ? '正式上線基本檢查通過'
            : overall === 'warning'
              ? '可繼續測試，但正式上線前仍有提醒項目'
              : '仍有阻擋正式上線的異常項目'}
        </strong>
        <div style={{ marginTop: 10 }}>
          正常 {passCount} 項｜需確認 {warningCount} 項｜異常 {failCount} 項
        </div>
      </div>

      {groups.map((group) => (
        <div key={group} className="card" style={{ marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>{group}</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {checks
              .filter((check) => check.group === group)
              .map((check) => (
                <div
                  key={`${group}-${check.name}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(170px,260px) 90px 1fr',
                    gap: 12,
                    padding: '10px 0',
                    borderTop: '1px solid #e5e7eb',
                    alignItems: 'start',
                  }}
                >
                  <strong>{check.name}</strong>
                  <strong style={{ color: statusColor(check.status) }}>
                    {statusText(check.status)}
                  </strong>
                  <div>{check.message}</div>
                </div>
              ))}
          </div>
        </div>
      ))}

      <div className="card" style={{ marginTop: 20 }}>
        <strong>正式上線前最後確認：</strong>
        <div className="muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
          OTP_DEV_MODE 必須關閉、OTP_HASH_SECRET 必須獨立且至少 32 字元、正式網址使用 HTTPS、簡訊商完成實機驗證、
          Supabase Service Role 只存在 Server 環境、anon 不可直接讀取申請／契約／OTP／簽署／操作紀錄／正式契約留存資料；
          正式上線前本頁「異常」必須為 0，並完成真實手機 OTP → 手寫簽名 → 正式 PDF → 進度查詢下載的端到端測試。
        </div>
      </div>
    </div>
  )
}
