import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const MODULES:any={
 attendance:{table:'monthly_attendance_sheets',bucket:'monthly-attendance',date:'attendance_month',label:'簽到表'},
 dengue:{table:'dengue_prevention_photos',bucket:'dengue-prevention',date:'work_date',label:'登革熱照片/報表'},
 violation:{table:'violation_parking_photos',bucket:'violation-parking',date:'photo_date',label:'違規停車照片'},
 disaster:{table:'disaster_inspection_photos',bucket:'disaster-inspections',date:null,label:'防災照片'},
 shift:{table:'shift_closing_reports',bucket:null,date:'closing_date',label:'結班報表'},
 taxi:{table:'taxi_discount_records',bucket:null,date:'discount_date',label:'計程車折扣'},
}
function admin(){const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!u||!k)throw new Error('伺服器環境變數未設定完整');return createAdminClient(u,k,{auth:{persistSession:false,autoRefreshToken:false}})}
async function supervisor(){const s=await createClient();const {data:{user}}=await s.auth.getUser();if(!user)return null;const {data:p}=await s.from('profiles').select('id,role,is_active').eq('id',user.id).maybeSingle();return p?.is_active&&p.role==='supervisor'?user:null}

export async function GET(request:Request){
 const user=await supervisor();if(!user)return NextResponse.json({error:'只有主管可以使用資料維護。'},{status:403});
 const url=new URL(request.url);const key=url.searchParams.get('module')||'attendance';const lot=url.searchParams.get('lot')||'';const from=url.searchParams.get('from')||'';const to=url.searchParams.get('to')||'';const cfg=MODULES[key];if(!cfg)return NextResponse.json({error:'不支援的資料類型'},{status:400});
 const db=admin(); let fields='id,parking_lot_id';
 if(key==='attendance') fields+=',attendance_month,file_name,file_size,storage_path,uploaded_at';
 if(key==='dengue') fields+=',work_date,work_type,file_kind,file_name,file_size,storage_path,uploaded_at';
 if(key==='violation') fields+=',photo_date,photo_type,file_name,file_size,storage_path,uploaded_at';
 if(key==='disaster') fields='id,inspection_id,file_name,storage_path,sort_order';
 if(key==='shift') fields+=',closing_date,operator_name,amount_paid,created_at';
 if(key==='taxi') fields+=',discount_date,vehicle_plate,discount_amount,created_at';
 let q=db.from(cfg.table).select(fields).limit(200);
 if(lot&&key!=='disaster')q=q.eq('parking_lot_id',lot);
 if(cfg.date&&from)q=q.gte(cfg.date,from);if(cfg.date&&to)q=q.lte(cfg.date,to);
 const {data,error}=await q;if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({rows:data||[]});
}

export async function DELETE(request:Request){
 const user=await supervisor();if(!user)return NextResponse.json({error:'只有主管可以刪除資料。'},{status:403});
 const body=await request.json();const key=String(body?.module||'');const id=String(body?.id||'');const cfg=MODULES[key];if(!cfg||!id)return NextResponse.json({error:'缺少刪除資料'},{status:400});
 const db=admin(); const fields=cfg.bucket?'id,storage_path,parking_lot_id':'id,parking_lot_id';const {data:row,error:readError}=await db.from(cfg.table).select(fields).eq('id',id).maybeSingle();if(readError||!row)return NextResponse.json({error:readError?.message||'找不到資料'},{status:404});
 if(cfg.bucket&&(row as any).storage_path){const {error:e}=await db.storage.from(cfg.bucket).remove([(row as any).storage_path]);if(e)return NextResponse.json({error:`Storage 刪除失敗：${e.message}`},{status:500})}
 const {error}=await db.from(cfg.table).delete().eq('id',id);if(error)return NextResponse.json({error:error.message},{status:500});
 try{await db.from('system_logs').insert({user_id:user.id,parking_lot_id:(row as any).parking_lot_id||null,action:'SUPERVISOR_DATA_DELETE',entity_type:cfg.table,entity_id:id,detail:{module:key,label:cfg.label}})}catch{}
 return NextResponse.json({ok:true})
}
