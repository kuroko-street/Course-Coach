import {useRef,useState} from 'react';
import {apiUploadMany} from '../api.js';
import {Modal,courseSubtitle} from './CourseUI.jsx';
import {FileQuota} from './ContributionStatus.jsx';
const MAX_BYTES=10000000,EXTENSIONS=['pdf','jpg','jpeg','png','docx','pptx','xlsx'];

export default function UploadDialog({courseId,course,quota,onClose,onSaved}){
  const [queue,setQueue]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');const running=useRef(false),wrapper=useRef(null);
  const waiting=queue.filter(r=>r.status!=='success'&&!r.error),successCount=queue.filter(r=>r.status==='success').length;
  const unattempted=waiting.filter(r=>!r.attempted).length,tooMany=!!quota&&unattempted>quota.available;
  function patch(id,next){setQueue(prev=>prev.map(row=>row.id===id?{...row,...next}:row));}
  function select(files){
    setError('');setQueue(prev=>[...prev,...Array.from(files).map(file=>({file,id:crypto.randomUUID(),status:'waiting',error:!EXTENSIONS.includes(file.name.split('.').pop().toLowerCase())?'ชนิดไฟล์ไม่รองรับ':!file.size?'ไฟล์ว่าง':file.size>MAX_BYTES?'ขนาดเกิน 10 MB':''}))]);
  }
  async function start(){
    if(running.current)return;
    // Attempted request IDs remain retryable at zero slots: a lost response may hide success.
    if(!quota||tooMany){setError(`เหลือ ${quota?.available??0} ช่อง กรุณานำไฟล์ส่วนเกินออกจากคิวก่อน`);return;}
    running.current=true;setBusy(true);setError('');
    try{
      for(const row of waiting){
        patch(row.id,{status:'uploading',attempted:true});
        try{await apiUploadMany(`/courses/${courseId}/summary-files`,{files:[row.file],fields:{upload_request_id:row.id}});patch(row.id,{status:'success'});}catch(e){patch(row.id,{status:'failed',error:e.message});}
      }
      await onSaved?.();
    }catch(e){setError('อัปโหลดแล้วบางรายการ แต่โหลดข้อมูลล่าสุดไม่สำเร็จ: '+e.message);}finally{running.current=false;setBusy(false);}
  }
  const dirty=queue.some(r=>r.status!=='success');
  return <Modal title="อัปโหลดไฟล์เรียน" subtitle={courseSubtitle(course)||`รายการวิชา #${courseId}`} onClose={onClose} busy={busy} dirty={dirty} footer={<><span className="ux-footer-hint" aria-live="polite">{successCount>0?`สำเร็จ ${successCount} / ${queue.length} ไฟล์`:'หนึ่งไฟล์ใช้หนึ่งช่อง'}</span><button type="button" className="btn-ghost" disabled={busy} onClick={()=>wrapper.current?.closest('[role="dialog"]')?.querySelector('.modal-close')?.click()}>{dirty?'ยกเลิก':'ปิด'}</button><button type="button" disabled={busy||!waiting.length||tooMany||!quota} onClick={start}>{busy?'กำลังอัปโหลด…':`อัปโหลด${waiting.length?` ${waiting.length} ไฟล์`:''}`}</button></>}>
    <div ref={wrapper}><FileQuota quota={quota}/><label className="ux-upload-picker"><strong>เลือกไฟล์ที่จะแบ่งปัน</strong><span>เลือกหลายไฟล์ได้ตามช่องว่าง · สูงสุด 10 MB ต่อไฟล์</span><input type="file" aria-label="เลือกไฟล์เรียน" multiple accept={EXTENSIONS.map(e=>'.'+e).join(',')} disabled={busy} onChange={e=>{select(e.target.files);e.target.value='';}}/></label><p className="ux-form-hint">รองรับ PDF, JPG, PNG, DOCX, PPTX และ XLSX · อัปโหลดเฉพาะไฟล์ที่มีสิทธิ์เผยแพร่ ไม่มีข้อมูลส่วนบุคคลหรือเฉลยที่ห้ามเผยแพร่</p>
      {tooMany&&<p role="alert" className="ux-quota-alert">เลือกไฟล์ใหม่ {unattempted} ไฟล์ แต่เหลือ {quota.available} ช่อง กรุณานำออก {unattempted-quota.available} ไฟล์ก่อนอัปโหลด</p>}
      <ul className="cc-upload-queue" aria-label="คิวอัปโหลด">{queue.map(row=><li key={row.id}><div><strong>{row.file.name}</strong><div className="meta">{(row.file.size/1048576).toFixed(2)} MB</div><div aria-live="polite" className={`cc-upload-state ${row.status==='success'?'ux-file-success':row.error?'ux-file-failed':''}`}>{row.status==='success'?'✓ อัปโหลดสำเร็จ':row.status==='uploading'?'กำลังอัปโหลด…':row.error||'รออัปโหลด'}</div></div>{!busy&&row.status!=='success'&&<div className="cc-actions">{row.status==='failed'&&<button type="button" className="btn-ghost" onClick={()=>patch(row.id,{status:'waiting',error:''})}>เตรียมลองใหม่</button>}<button type="button" className="btn-ghost" aria-label={`นำ ${row.file.name} ออกจากคิว`} onClick={()=>setQueue(prev=>prev.filter(x=>x.id!==row.id))}>นำออก</button></div>}</li>)}</ul>
      {error&&<p role="alert" className="alert alert-error">{error}</p>}{successCount>0&&<p role="status" className="ux-upload-progress">ไฟล์ที่สำเร็จแล้วเก็บไว้เรียบร้อย ไม่ต้องส่งซ้ำ</p>}
    </div>
  </Modal>;
}
