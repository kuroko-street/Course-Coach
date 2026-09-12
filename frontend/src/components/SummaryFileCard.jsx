import {useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {api,summaryFileDownloadUrl} from '../api.js';
import {useAuth} from '../AuthContext.jsx';
import CommentThread from './CommentThread.jsx';
import ActionMenu from './ActionMenu.jsx';
import {ConfirmDialog} from './Modal.jsx';
import {loginPath} from './CourseUI.jsx';

export default function SummaryFileCard({file:f,onChanged}){
  const {user}=useAuth(),location=useLocation();
  const [comments,setComments]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(null);
  async function action(suffix,method){setBusy(true);setError('');try{await api(`/summary-files/${f.file_id}${suffix}`,{method});setConfirm(null);await onChanged?.();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <article className="card ux-review-card"><div className="ux-file-main"><div className="ux-file-info"><span className="ux-file-type" aria-hidden="true">{f.filename.split('.').pop().toUpperCase()}</span><div><h3>{f.filename}</h3><p className="meta">{(Number(f.size_bytes)/1048576).toFixed(2)} MB · {new Date(f.uploaded_at+'Z').toLocaleDateString('th-TH')}</p><p className="meta">แบ่งปันโดย <Link to={`/profile/${f.uploader_id}`}>{f.uploader_name}</Link></p></div></div>{user?<a className="btn" href={summaryFileDownloadUrl(f.file_id)}>ดาวน์โหลด</a>:<Link className="btn" to={loginPath(location.pathname+location.search)}>เข้าสู่ระบบเพื่อดาวน์โหลด</Link>}</div>
    <div className="ux-card-actions">{user?<button type="button" className="btn-ghost" disabled={busy} aria-pressed={f.liked_by_me} aria-label={`ถูกใจไฟล์ ${f.like_count} ครั้ง`} onClick={()=>action('/like','POST')}>{f.liked_by_me?'♥':'♡'} {f.like_count} ถูกใจ</button>:<Link className="btn btn-ghost" to={loginPath(location.pathname+location.search)}>♡ {f.like_count} ถูกใจ</Link>}<button type="button" className="btn-ghost" aria-expanded={comments} onClick={()=>setComments(!comments)}>ความคิดเห็น ({f.comment_count})</button>
      {user&&<ActionMenu label={`ตัวเลือกไฟล์ ${f.filename}`}>{user.user_id===f.uploader_id?<button className="ux-danger" type="button" disabled={busy} onClick={()=>{setError('');setConfirm('delete');}}>ลบไฟล์</button>:<button type="button" disabled={busy||f.reported_by_me} onClick={()=>{setError('');setConfirm('report');}}>{f.reported_by_me?'รายงานแล้ว':'รายงานไฟล์'}</button>}</ActionMenu>}
    </div>{error&&!confirm&&<p role="alert" className="alert alert-error">{error}</p>}{comments&&<CommentThread basePath={`/summary-files/${f.file_id}`} onChanged={onChanged}/>}
    {confirm&&<ConfirmDialog title={confirm==='delete'?'ลบไฟล์นี้?':'รายงานไฟล์นี้?'} confirmLabel={confirm==='delete'?'ยืนยันลบไฟล์':'ยืนยันรายงาน'} busy={busy} error={error} onClose={()=>setConfirm(null)} onConfirm={()=>action(confirm==='delete'?'':'/report',confirm==='delete'?'DELETE':'POST')}>{confirm==='delete'?`ไฟล์ “${f.filename}” จะไม่แสดงในรายวิชา การลบไฟล์ปกติคืนช่องอัปโหลดให้คุณทันที`:'ใช้เมื่อพบไฟล์ที่ไม่เหมาะสม บัญชีเดิมนับรายงานได้ครั้งเดียว เมื่อครบ 5 บัญชี ระบบจะซ่อนไฟล์อัตโนมัติ'}</ConfirmDialog>}
  </article>;
}
