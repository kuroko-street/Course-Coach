import {useRef,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {api,summaryFileDownloadUrl,summaryFilePreviewUrl} from '../api.js';
import {useAuth} from '../AuthContext.jsx';
import CommentThread from './CommentThread.jsx';
import ActionMenu from './ActionMenu.jsx';
import {ConfirmDialog,Modal} from './Modal.jsx';
import {loginPath} from './CourseUI.jsx';
import {useToast} from './ToastProvider.jsx';

export default function SummaryFileCard({file:f,onChanged,onLikeChanged,onCourseError}){
  const toast=useToast();
  const {user}=useAuth(),location=useLocation();
  const [comments,setComments]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(null);
  const actionRunning=useRef(false);
  const [previewOpen,setPreviewOpen]=useState(false),[previewFailed,setPreviewFailed]=useState(false),[previewReady,setPreviewReady]=useState(false);
  const type=f.filename.split('.').pop().toUpperCase();
  const hasPreview=user&&['application/pdf','image/jpeg','image/png'].includes(f.mime_type)&&!previewFailed;
  async function action(suffix,method){
    if(actionRunning.current)return;
    actionRunning.current=true;setBusy(true);setError('');
    const liking=suffix==='/like',before={liked:f.liked_by_me,count:f.like_count};
    if(liking)onLikeChanged?.(f.file_id,!before.liked,before.count+(before.liked?-1:1));
    try{
      const result=await api(`/summary-files/${f.file_id}${suffix}`,{method});
      setConfirm(null);
      if(liking)onLikeChanged?.(f.file_id,result.liked,result.like_count);
      else if(await onChanged?.()===false)return;
      if(suffix==='/report')toast.success('รายงานไฟล์แล้ว');
      else if(method==='DELETE')toast.success('ลบไฟล์แล้ว');
    }catch(e){
      if(liking)onLikeChanged?.(f.file_id,before.liked,before.count);
      if(await onCourseError?.(e))return;
      if(liking)toast.error('กดถูกใจไม่สำเร็จ',e.message);
      else setError(e.message);
    }finally{actionRunning.current=false;setBusy(false);}
  }
  return <article className="card ux-review-card ux-file-card"><div className="ux-file-main"><div className="ux-file-info">
      <div className="ux-file-preview">{hasPreview?<button type="button" className={`ux-preview-button ${previewReady?'is-ready':''}`} aria-label={`ขยายภาพตัวอย่าง ${f.filename}`} onClick={()=>setPreviewOpen(true)} disabled={!previewReady}><img src={summaryFilePreviewUrl(f.file_id)} alt={f.mime_type==='application/pdf'?`ภาพหน้าแรกของ ${f.filename}`:`ภาพตัวอย่าง ${f.filename}`} loading="lazy" onLoad={()=>setPreviewReady(true)} onError={()=>setPreviewFailed(true)}/>{!previewReady&&<span className="ux-preview-loading">กำลังโหลดภาพ…</span>}<span className="ux-preview-action" aria-hidden="true">ดูภาพ</span></button>:<span className="ux-file-type" aria-label={`ไฟล์ ${type}`}>{type}</span>}</div>
      <div><h3 title={f.filename}>{f.filename}</h3><p className="meta">{(Number(f.size_bytes)/1048576).toFixed(2)} MB · {new Date(f.uploaded_at+'Z').toLocaleDateString('th-TH')}</p><p className="meta">แบ่งปันโดย <Link title={f.uploader_name} to={`/profile/${f.uploader_id}`}>{f.uploader_name}</Link></p>{!user&&<p className="meta">เข้าสู่ระบบเพื่อดูภาพตัวอย่าง</p>}</div></div>{user?<a className="btn" href={summaryFileDownloadUrl(f.file_id)}>ดาวน์โหลด</a>:<Link className="btn" to={loginPath(location.pathname+location.search)}>เข้าสู่ระบบเพื่อดาวน์โหลด</Link>}</div>
    <div className="ux-card-actions">{user?<button type="button" className="btn-ghost" disabled={busy} aria-pressed={f.liked_by_me} aria-label={`ถูกใจไฟล์ ${f.like_count} ครั้ง`} onClick={()=>action('/like','POST')}><svg className="review-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg> {f.like_count} ถูกใจ</button>:<Link className="btn btn-ghost" to={loginPath(location.pathname+location.search)}><svg className="review-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg> {f.like_count} ถูกใจ</Link>}<button type="button" className="btn-ghost" aria-expanded={comments} onClick={()=>setComments(!comments)}>ความคิดเห็น ({f.comment_count})</button>
      {user&&<ActionMenu label={`ตัวเลือกไฟล์ ${f.filename}`}>{user.user_id===f.uploader_id?<button className="ux-danger" type="button" disabled={busy} onClick={()=>{setError('');setConfirm('delete');}}>ลบไฟล์</button>:<button type="button" className="ux-danger" disabled={busy||f.reported_by_me} onClick={()=>{setError('');setConfirm('report');}}>{f.reported_by_me?'รายงานแล้ว':'รายงานไฟล์'}</button>}</ActionMenu>}
    </div>{error&&!confirm&&<p role="alert" className="alert alert-error">{error}</p>}{comments&&<CommentThread basePath={`/summary-files/${f.file_id}`} onChanged={onChanged} onCourseError={onCourseError}/>}
    {previewOpen&&<Modal title={`ภาพตัวอย่าง ${f.filename}`} subtitle={f.mime_type==='application/pdf'?'หน้าแรกของ PDF':'รูปภาพที่อัปโหลด'} onClose={()=>setPreviewOpen(false)} footer={<a className="btn" href={summaryFileDownloadUrl(f.file_id)}>ดาวน์โหลดไฟล์ต้นฉบับ</a>}><img className="ux-preview-large" src={summaryFilePreviewUrl(f.file_id)} alt={`ภาพตัวอย่าง ${f.filename}`}/></Modal>}
    {confirm&&<ConfirmDialog title={confirm==='delete'?'ลบไฟล์นี้?':'รายงานไฟล์นี้?'} confirmLabel={confirm==='delete'?'ยืนยันลบไฟล์':'ยืนยันรายงาน'} busy={busy} error={error} onClose={()=>setConfirm(null)} onConfirm={()=>action(confirm==='delete'?'':'/report',confirm==='delete'?'DELETE':'POST')}>{confirm==='delete'?`ไฟล์ “${f.filename}” จะไม่แสดงในรายวิชา การลบไฟล์ปกติคืนช่องอัปโหลดให้คุณทันที`:'คุณต้องการรายงานไฟล์นี้ว่าไม่เหมาะสมใช่หรือไม่?'}</ConfirmDialog>}
  </article>;
}
