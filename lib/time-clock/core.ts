import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'

export const db = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('缺少 Supabase 伺服器設定')
  return createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
export const token = () => randomBytes(32).toString('hex')
export const digest = (v: string) => createHash('sha256').update(v).digest('hex')
export const pinHash = (pin: string) => { const salt=randomBytes(16).toString('hex'); return `${salt}:${scryptSync(pin,salt,64).toString('hex')}` }
export const verifyPin = (pin:string, stored:string) => {
  const [salt, hash]=String(stored||'').split(':')
  if(!salt || !hash || !/^[a-f0-9]{128}$/i.test(hash))return false
  return timingSafeEqual(scryptSync(pin,salt,64),Buffer.from(hash,'hex'))
}
export const validPin = (v: unknown) => typeof v==='string' && /^\d{4,6}$/.test(v)
export const clientIp = (req:Request) => {
  // On Vercel, the trusted edge sets x-forwarded-for; do not deploy behind an untrusted proxy.
  const ip=(req.headers.get('x-forwarded-for')||req.headers.get('x-real-ip')||'').split(',')[0].trim()
  return /^[\w.:]+$/.test(ip)?ip:''
}
export async function requireSupervisor(){
  const client=await createClient(); const {data:{user}}=await client.auth.getUser()
  if(!user)return null
  const {data:p}=await client.from('profiles').select('role,is_active').eq('id',user.id).maybeSingle()
  return p?.is_active && p.role==='supervisor' ? user : null
}
