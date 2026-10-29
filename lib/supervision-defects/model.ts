export type Status='draft'|'pending'|'submitted'|'returned'|'approved'|'closed'
export const LABEL:Record<Status,string>={draft:'草稿',pending:'待改善',submitted:'待主管審核',returned:'退回補件',approved:'已確認改善',closed:'已結案'}
export const BUCKET='supervision-defects'
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export type Photo={id:string;field_visible?:boolean;kind:'source'|'original'|'improvement';file_name:string;storage_path:string;page_number:number|null;photo_date:string|null;taken_at_text:string;uploaded_at:string;uploaded_by:string;url:string}
export type Case={id:string;field_selection_saved_at?:string|null;report_id:string;parking_lot_id:string;inspection_date:string;item_text:string;content:string;location_text:string;original_description:string;source_pages:number[];expected_original_count:number;status:Status;version:number;due_date:string|null;improvement_date:string|null;review_note:string;photos:Photo[];lot_name:string;source_file_name:string;events?:Event[]}
export type Event={id:string;action:string;note:string;created_at:string;push_state:string;line_state?:string;line_sent?:number}
export function date(value:string){const m=String(value||'').match(/^(\d{3,4})[年/.-](\d{1,2})[月/.-](\d{1,2})(?:日|\b)/);if(!m)return '';let y=+m[1];if(y<1911)y+=1911;const mo=+m[2],day=+m[3],d=new Date(Date.UTC(y,mo-1,day));return y>=2000&&y<=2100&&d.getUTCFullYear()===y&&d.getUTCMonth()===mo-1&&d.getUTCDate()===day?`${y}-${String(mo).padStart(2,'0')}-${String(day).padStart(2,'0')}`:''}
export function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date())}
export function canLot(profile:{role:string;is_active:boolean},ids:string[],id:string){return profile.is_active&&(profile.role==='supervisor'||profile.role==='manager'&&ids.includes(id))}
export function validDraft(r:{parking_lot_id:string;inspection_date:string;item_text:string;content:string}){if(!UUID.test(r.parking_lot_id)||!r.inspection_date||date(r.inspection_date)!==r.inspection_date||!r.item_text?.trim()||!r.content?.trim()||r.item_text.length>2000||r.content.length>4000)throw new Error('請確認場站、督導日期、缺失項目與需改善內容')}
export function canTransition(role:string,status:Status,action:string,photos=0){if(!['supervisor','manager'].includes(role))return false;if(action==='submit')return ['pending','returned','submitted'].includes(status)&&photos>0;return role==='supervisor'&&(action==='publish'?status==='draft'&&photos>0:action==='close'?status==='approved':['approve','return'].includes(action)&&status==='submitted')}
export function recipients(target:string,lot:string,profiles:Array<{id:string;role:string;is_active:boolean}>,assignments:Array<{user_id:string;parking_lot_id:string}>){return profiles.filter(p=>p.is_active&&(target==='supervisor'?p.role==='supervisor':p.role==='manager'&&assignments.some(a=>a.user_id===p.id&&a.parking_lot_id===lot))).map(p=>p.id)}

export function fieldPhotos<T extends {kind:string;field_visible?:boolean}>(photos:T[]):T[]{return photos.filter(p=>p.kind==='improvement'||p.kind==='original'&&p.field_visible!==false)}

export function groupCases<T extends {parking_lot_id:string;inspection_date:string}>(cases:T[]){const groups=new Map<string,{key:string;cases:T[]}>();for(const c of cases){const key=c.parking_lot_id+'|'+c.inspection_date;let g=groups.get(key);if(!g){g={key,cases:[]};groups.set(key,g)}g.cases.push(c)}return [...groups.values()]}
export function defectContent(location:string,description:string){const text=description.trim();return text?`地點：${location.trim()||'未註明'}\n說明：${text}`:''}
export function fieldContent(c:{location_text:string;original_description:string;content:string;item_text?:string}){const text=c.content.trim(),item=c.item_text?.trim()||'',question=(s:string)=>/是否|[?？]/.test(s);if(/^地點[:：][\s\S]*\n說明[:：]/.test(text))return text;const inherited=!!item&&question(item)&&text.startsWith(item);if(text&&text!==item&&!inherited)return defectContent(c.location_text,text);const description=c.original_description.trim();if(question(description)&&question(item))return `地點：${c.location_text.trim()||'未註明'}\n說明：原資料為查核問句，請主管核對原頁並補正`;return defectContent(c.location_text,description)||`地點：${c.location_text.trim()||'未註明'}\n說明：尚未讀取，請主管核對`}

export function fieldTitle(c:{location_text:string;original_description:string;content:string;item_text?:string}){const text=(fieldContent(c).split(/\n說明[:：]/)[1]||'缺失說明待確認').replace(/\s+/g,' ').trim();return text.length>100?text.slice(0,100)+'…':text}

export function contentAtLocation(location:string,content:string,original:string){const marker=content.search(/\n說明[:：]/),description=marker>=0?content.slice(marker+4):content.trim()||original;return defectContent(location,description)}
export type DefectSection='draft'|'dispatched'|'replied'
export const SECTION_LABEL:Record<DefectSection,string>={draft:'草稿確認區',dispatched:'已派發',replied:'現場已回覆'}
export const SECTION_STATUSES:Record<DefectSection,Status[]>={draft:['draft'],dispatched:['pending','returned'],replied:['submitted','approved','closed']}
export function sectionForStatus(status:Status):DefectSection{return status==='draft'?'draft':['pending','returned'].includes(status)?'dispatched':'replied'}
export function defaultSectionStatus(section:DefectSection){return section==='replied'?'submitted':''}

export function publishIssues(c:Case){const issues:string[]=[],original=c.photos.filter(p=>p.kind==='original');if(!original.some(p=>p.field_visible!==false))issues.push('請選至少一張提供現場的照片');if(original.length<c.expected_original_count)issues.push(`原始照片尚缺${c.expected_original_count-original.length}張`);const missing=c.source_pages.filter(n=>!c.photos.some(p=>p.kind==='source'&&p.page_number===n));if(missing.length)issues.push(`尚缺第${missing.join('、')}頁完整來源頁面`);return issues}
