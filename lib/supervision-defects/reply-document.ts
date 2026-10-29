import type{Case}from'./model'
import{fieldContent,fieldTitle}from'./model'
import{replyCases,safeSegment}from'./photo-package'
const esc=(v:unknown)=>String(v??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!))
function paragraph(text:string,style='Normal',pageBreak=false,keep=false){return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${pageBreak?'<w:pageBreakBefore/>':''}${keep?'<w:keepNext/>':''}</w:pPr><w:r>${String(text).split('\n').map((line,i)=>(i?'<w:br/>':'')+`<w:t xml:space="preserve">${esc(line)}</w:t>`).join('')}</w:r></w:p>`}
export type ReplyImage={caseId:string;photoId:string;bytes:Uint8Array;extension:'jpg'|'png';width:number;height:number;date:string}
export async function buildReplyWord(cs:Case[],images:ReplyImage[]){const rows=replyCases(cs);if(!rows.length)throw new Error('目前範圍尚無改善後照片，請選擇有改善照片的項目');const{default:JSZip}=await import('jszip'),zip=new JSZip();let body=paragraph('督導缺失改善照片對照資料','Title')+paragraph('供製作改善回覆公文核對使用。各項資料依停車場及督導日期整理，改善後照片直接放在對應缺失下方，可複製文字與照片。');const rels:string[]=[];let number=0;
 for(let i=0;i<rows.length;i++){const c=rows[i],label=`缺失 ${i+1}`;body+=paragraph(`${label}　${c.lot_name}`,'Heading1',i>0)+paragraph(`停車場：${c.lot_name}\n督導日期：${c.inspection_date}\n缺失地點：${c.location_text||'未註明'}`)+paragraph(`缺失內容：${fieldTitle(c)}`,'Heading2')+paragraph(fieldContent(c))+paragraph(`改善日期：${c.improvement_date||'請參照各照片改善日期'}`)+paragraph(`案件編號：${c.id}`,'Caption');for(let j=0;j<c.photos.length;j++){const p=c.photos[j],image=images.find(x=>x.caseId===c.id&&x.photoId===p.id);if(!image)throw new Error('改善照片未完整讀取，尚未產生 Word');const id=++number,rid=`rIdPhoto${id}`,file=`photo${id}.${image.extension}`,scale=Math.min(5486400/image.width,2743200/image.height),cx=Math.round(image.width*scale),cy=Math.round(image.height*scale);zip.file('word/media/'+file,image.bytes);rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${file}"/>`);body+=paragraph(`照片 ${i+1}-${j+1}　${c.lot_name}　${label}\n改善日期：${image.date||'未填'}`,'Caption',false,true)+`<w:p><w:pPr><w:spacing w:after="180"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="照片 ${i+1}-${j+1}" descr="${esc(c.lot_name+' '+label+' 改善後照片')}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${file}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`}}
 zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');zip.file('word/_rels/document.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.join('')}</Relationships>`);
 zip.file('word/styles.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Noto Sans CJK TC"/><w:color w:val="000000"/><w:sz w:val="24"/><w:lang w:val="zh-TW" w:eastAsia="zh-TW"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="320" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${[['Title',36],['Heading1',30],['Heading2',26],['Caption',21]].map(([name,size])=>`<w:style w:type="paragraph" w:styleId="${name}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:pPr>${name==='Caption'?'':'<w:keepNext/>'}<w:spacing w:before="160" w:after="140"/></w:pPr><w:rPr><w:color w:val="000000"/>${name==='Caption'?'':'<w:b/>'}<w:sz w:val="${size}"/></w:rPr></w:style>`).join('')}</w:styles>`);
 zip.file('word/document.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="0" w:footer="0"/></w:sectPr></w:body></w:document>`);return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'})}
export async function replyWord(cs:Case[],progress:(s:string)=>void,singleDocx=false){
 const rows=replyCases(cs);
 if(!rows.length)throw new Error('目前範圍尚無改善後照片，請選擇有改善照片的項目');
 const images:ReplyImage[]=[];
 const failed=new Set<string>();
 let done=0,size=0,skipped=0;
 const total=rows.reduce((n,c)=>n+c.photos.length,0);
 for(const c of rows)for(const p of c.photos){
  progress(`讀取改善照片 ${++done}/${total}：${c.lot_name}（跳過 ${skipped} 筆）`);
  if(failed.has(c.id))continue;
  try{
   if(!p.url)throw new Error('照片連結失效');
   const r=await fetch(p.url);
   if(!r.ok)throw new Error('改善照片讀取失敗');
   const blob=await r.blob();
   if(size+blob.size>150*1024*1024)throw new Error('照片容量已達150MB限制');
   const bitmap=await createImageBitmap(blob);
   try{
    let data:Blob=blob,extension:'jpg'|'png';
    const signature=new Uint8Array(await blob.slice(0,8).arrayBuffer());
    if(signature[0]===255&&signature[1]===216&&signature[2]===255)extension='jpg';
    else if(signature[0]===137&&signature[1]===80&&signature[2]===78&&signature[3]===71)extension='png';
    else{
     const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
     const ctx=canvas.getContext('2d');if(!ctx)throw new Error('無法處理照片');ctx.drawImage(bitmap,0,0);
     data=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('照片轉換失敗')),'image/png'));
     extension='png';canvas.width=canvas.height=0;
    }
    images.push({caseId:c.id,photoId:p.id,bytes:new Uint8Array(await data.arrayBuffer()),extension,width:bitmap.width,height:bitmap.height,date:p.photo_date||c.improvement_date||''});
    size+=blob.size;
   }finally{bitmap.close()}
  }catch(e){
   failed.add(c.id);skipped++;
   progress(`已跳過 ${skipped} 筆無法完整讀取照片的缺失；繼續處理其他停車場（${e instanceof Error?e.message:'照片異常'}）`);
  }
 }
 const valid=rows.filter(c=>!failed.has(c.id)&&c.photos.every(p=>images.some(x=>x.caseId===c.id&&x.photoId===p.id)));
 if(!valid.length)throw new Error('沒有可完成匯出的改善照片；請確認缺失已上傳改善照片且照片連結可讀取');
 progress(`開始產生 Word：可匯出 ${valid.length} 筆，跳過 ${rows.length-valid.length} 筆…`);
 const first=valid[0];
 if(singleDocx&&valid.some(c=>c.parking_lot_id!==first.parking_lot_id||c.inspection_date!==first.inspection_date))throw new Error('單份 Word 必須是同場站、同督導日期');
 const blob=singleDocx?await buildReplyWord(valid,images):await buildReplyWordZip(valid,images,progress);
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=singleDocx?`${safeSegment(first.lot_name)}_${first.inspection_date.replace(/-/g,'')}_缺失改善回覆.docx`:'各場站各次督導_缺失改善回覆Word.zip';document.body.append(a);a.click();a.remove();
 progress(`下載已觸發：完成 ${valid.length} 筆，跳過 ${rows.length-valid.length} 筆；請查看瀏覽器下載項目`);
 setTimeout(()=>URL.revokeObjectURL(url),60000)
}
export async function buildReplyWordZip(cs:Case[],images:ReplyImage[],progress:(s:string)=>void=()=>{}){
 const rows=replyCases(cs).filter(c=>c.photos.every(p=>images.some(x=>x.caseId===c.id&&x.photoId===p.id)));
 if(!rows.length)throw new Error('目前範圍沒有可完整匯出的改善照片');
 const{default:JSZip}=await import('jszip'),zip=new JSZip(),groups=new Map<string,Case[]>(),used=new Set<string>();
 for(const c of rows){const key=[c.parking_lot_id,c.inspection_date,c.report_id].join('|');const group=groups.get(key)||[];group.push(c);groups.set(key,group)}
 let done=0,success=0,skipped=0;
 for(const group of groups.values()){
  const first=group[0];progress(`產生各場 Word ${++done}/${groups.size}：${first.lot_name}（成功 ${success}，跳過 ${skipped}）`);
  try{
   const datePart=first.inspection_date.replace(/-/g,'');const reportPart=first.report_id.slice(0,8);
   const base=safeSegment(first.lot_name)+'_'+datePart+'_'+reportPart+'_缺失改善回覆';
   let name=base+'.docx',suffix=2;while(used.has(name.normalize('NFKC').toLowerCase()))name=base+'_'+(suffix++)+'.docx';
   const ids=new Set(group.map(c=>c.id)),doc=await buildReplyWord(group,images.filter(p=>ids.has(p.caseId)));
   zip.file(name,await doc.arrayBuffer());used.add(name.normalize('NFKC').toLowerCase());success++;
  }catch(e){skipped++;progress(`跳過無法產生的場站批次：${first.lot_name}；其餘繼續（${e instanceof Error?e.message:'匯出異常'}）`)}
 }
 if(!success)throw new Error('所有場站批次皆無法建立 Word，請檢查改善照片及資料');
 progress(`打包 Word：成功 ${success} 份，跳過 ${skipped} 份…`);
 return zip.generateAsync({type:'blob',mimeType:'application/zip',compression:'STORE'});
}
