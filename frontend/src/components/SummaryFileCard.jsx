import {useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {api,summaryFileDownloadUrl,summaryFilePreviewUrl} from '../api.js';
import {useAuth} from '../AuthContext.jsx';
import CommentThread from './CommentThread.jsx';
import ActionMenu from './ActionMenu.jsx';
import {ConfirmDialog,Modal} from './Modal.jsx';
import {loginPath} from './CourseUI.jsx';

export default function SummaryFileCard({file:f,onChanged}){
  const {user}=useAuth(),location=useLocation();
  const [comments,setComments]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(null);
  const [previewOpen,setPreviewOpen]=useState(false),[previewFailed,setPreviewFailed]=useState(false),[previewReady,setPreviewReady]=useState(false);
  const type=f.filename.split('.').pop().toUpperCase();
  const hasPreview=user&&['application/pdf','image/jpeg','image/png'].includes(f.mime_type)&&!previewFailed;
  async function action(suffix,method){setBusy(true);setError('');try{await api(`/summary-files/${f.file_id}${suffix}`,{method});setConfirm(null);await onChanged?.();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <article className="card ux-review-card ux-file-card"><div className="ux-file-main"><div className="ux-file-info">
      <div className="ux-file-preview">{hasPreview?<button type="button" className={`ux-preview-button ${previewReady?'is-ready':''}`} aria-label={`ขยายภาพตัวอย่าง ${f.filename}`} onClick={()=>setPreviewOpen(true)} disabled={!previewReady}><img src={summaryFilePreviewUrl(f.file_id)} alt={f.mime_type==='application/pdf'?`ภาพหน้าแรกของ ${f.filename}`:`ภาพตัวอย่าง ${f.filename}`} loading="lazy" onLoad={()=>setPreviewReady(true)} onError={()=>setPreviewFailed(true)}/>{!previewReady&&<span className="ux-preview-loading">กำลังโหลดภาพ…</span>}<span className="ux-preview-action" aria-hidden="true">ดูภาพ</span></button>:<span className="ux-file-type" aria-label={`ไฟล์ ${type}`}>{type}</span>}</div>
      <div><h3>{f.filename}</h3><p className="meta">{(Number(f.size_bytes)/1048576).toFixed(2)} MB · {new Date(f.uploaded_at+'Z').toLocaleDateString('th-TH')}</p><p className="meta">แบ่งปันโดย <Link to={`/profile/${f.uploader_id}`}>{f.uploader_name}</Link></p>{!user&&<p className="meta">เข้าสู่ระบบเพื่อดูภาพตัวอย่าง</p>}</div></div>{user?<a className="btn" href={summaryFileDownloadUrl(f.file_id)}>ดาวน์โหลด</a>:<Link className="btn" to={loginPath(location.pathname+location.search)}>เข้าสู่ระบบเพื่อดาวน์โหลด</Link>}</div>
    <div className="ux-card-actions">{user?<button type="button" className="btn-ghost" disabled={busy} aria-pressed={f.liked_by_me} aria-label={`ถูกใจไฟล์ ${f.like_count} ครั้ง`} onClick={()=>action('/like','POST')}>{f.liked_by_me?'♥':'♡'} {f.like_count} ถูกใจ</button>:<Link className="btn btn-ghost" to={loginPath(location.pathname+location.search)}>♡ {f.like_count} ถูกใจ</Link>}<button type="button" className="btn-ghost" aria-expanded={comments} onClick={()=>setComments(!comments)}>ความคิดเห็น ({f.comment_count})</button>
      {user&&<ActionMenu label={`ตัวเลือกไฟล์ ${f.filename}`}>{user.user_id===f.uploader_id?<button className="ux-danger" type="button" disabled={busy} onClick={()=>{setError('');setConfirm('delete');}}>ลบไฟล์</button>:<button type="button" disabled={busy||f.reported_by_me} onClick={()=>{setError('');setConfirm('report');}}>{f.reported_by_me?'รายงานแล้ว':'รายงานไฟล์'}</button>}</ActionMenu>}
    </div>{error&&!confirm&&<p role="alert" className="alert alert-error">{error}</p>}{comments&&<CommentThread basePath={`/summary-files/${f.file_id}`} onChanged={onChanged}/>}
    {previewOpen&&<Modal title={`ภาพตัวอย่าง ${f.filename}`} subtitle={f.mime_type==='application/pdf'?'หน้าแรกของ PDF':'รูปภาพที่อัปโหลด'} onClose={()=>setPreviewOpen(false)} footer={<a className="btn" href={summaryFileDownloadUrl(f.file_id)}>ดาวน์โหลดไฟล์ต้นฉบับ</a>}><img className="ux-preview-large" src={summaryFilePreviewUrl(f.file_id)} alt={`ภาพตัวอย่าง ${f.filename}`}/></Modal>}
    {confirm&&<ConfirmDialog title={confirm==='delete'?'ลบไฟล์นี้?':'รายงานไฟล์นี้?'} confirmLabel={confirm==='delete'?'ยืนยันลบไฟล์':'ยืนยันรายงาน'} busy={busy} error={error} onClose={()=>setConfirm(null)} onConfirm={()=>action(confirm==='delete'?'':'/report',confirm==='delete'?'DELETE':'POST')}>{confirm==='delete'?`ไฟล์ “${f.filename}” จะไม่แสดงในรายวิชา การลบไฟล์ปกติคืนช่องอัปโหลดให้คุณทันที`:'ใช้เมื่อพบไฟล์ที่ไม่เหมาะสม บัญชีเดิมนับรายงานได้ครั้งเดียว เมื่อครบ 5 บัญชี ระบบจะซ่อนไฟล์อัตโนมัติ'}</ConfirmDialog>}
  </article>;
}
