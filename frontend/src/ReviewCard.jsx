import {useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {api} from './api.js';
import {useAuth} from './AuthContext.jsx';
import {RatingBreakdown,ratingsFromReview} from './RatingStars.jsx';
import Avatar from './Avatar.jsx';
import ReviewEditor from './components/ReviewEditor.jsx';
import CommentThread from './components/CommentThread.jsx';
import ActionMenu from './components/ActionMenu.jsx';
import {ConfirmDialog} from './components/Modal.jsx';
import {loginPath} from './components/CourseUI.jsx';

export default function ReviewCard({review:r,course,onChanged}){
  const {user}=useAuth(),location=useLocation();
  const [comments,setComments]=useState(false),[edit,setEdit]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(null);
  async function action(suffix,method){setBusy(true);setError('');try{await api(`/reviews/${r.review_id}${suffix}`,{method});setConfirm(null);await onChanged?.();}catch(e){setError(e.message);}finally{setBusy(false);}}
  const own=user?.user_id===r.reviewer_id;
  return <article className="card ux-review-card"><div className="ux-review-header"><div className="ux-author"><Avatar url={r.reviewer_avatar} size={34}/><div><Link to={`/profile/${r.reviewer_id}`}>{r.reviewer_name}</Link><time dateTime={r.created_at+'Z'}>{new Date(r.created_at+'Z').toLocaleDateString('th-TH')}{r.edited_at?' · แก้ไขแล้ว':''}</time></div></div><span className="ux-review-score" aria-label={`ความพึงพอใจ ${r.rating_satisfaction} จาก 5`}>★ {r.rating_satisfaction} / 5</span></div>
    <p className="review-content">{r.content}</p><div className="tag-chips">{(r.tags||[]).map(t=><span className="tag-chip tag-chip-static" key={t.tag_id}>#{t.tag_name}</span>)}</div>
    <details className="ux-review-details"><summary>ดูคะแนนรายด้าน</summary><RatingBreakdown ratings={ratingsFromReview(r)} excludeSatisfaction/></details>
    <div className="ux-card-actions">{user?<button type="button" className="btn-ghost" disabled={busy} aria-pressed={r.liked_by_me} aria-label={`ถูกใจรีวิว ${r.like_count} ครั้ง`} onClick={()=>action('/like',r.liked_by_me?'DELETE':'POST')}>{r.liked_by_me?'♥':'♡'} {r.like_count} ถูกใจ</button>:<Link className="btn btn-ghost" to={loginPath(location.pathname+location.search)}>♡ {r.like_count} ถูกใจ</Link>}
      <button type="button" className="btn-ghost" aria-expanded={comments} onClick={()=>setComments(!comments)}>ความคิดเห็น ({r.comment_count})</button>
      {user&&<ActionMenu label={`ตัวเลือกรีวิวของ ${r.reviewer_name}`}>{own?<><button type="button" disabled={busy} onClick={()=>setEdit(true)}>แก้ไขรีวิว</button><button type="button" className="ux-danger" disabled={busy} onClick={()=>{setError('');setConfirm('delete');}}>ลบรีวิว</button></>:<button type="button" disabled={busy||r.reported_by_me} onClick={()=>{setError('');setConfirm('report');}}>{r.reported_by_me?'รายงานแล้ว':'รายงานรีวิว'}</button>}</ActionMenu>}
    </div>{error&&!confirm&&<p className="alert alert-error" role="alert">{error}</p>}{comments&&<CommentThread basePath={`/reviews/${r.review_id}`} onChanged={onChanged}/>}
    {edit&&<ReviewEditor courseId={r.course_id} course={course} review={r} onClose={()=>setEdit(false)} onSaved={onChanged}/>}
    {confirm&&<ConfirmDialog title={confirm==='delete'?'ลบรีวิวนี้?':'รายงานรีวิวนี้?'} confirmLabel={confirm==='delete'?'ยืนยันลบรีวิว':'ยืนยันรายงาน'} busy={busy} error={error} onClose={()=>setConfirm(null)} onConfirm={()=>action(confirm==='delete'?'':'/report',confirm==='delete'?'DELETE':'POST')}>{confirm==='delete'?'รีวิวจะไม่แสดงและไม่นับคะแนนหรือแท็กต่อ ลบรีวิวปกติแล้วคุณเขียนใหม่ในรายการนี้ได้ทันที':'ใช้เมื่อพบเนื้อหาที่ไม่เหมาะสม บัญชีเดิมนับรายงานได้ครั้งเดียว เมื่อครบ 5 บัญชี ระบบจะซ่อนรีวิวอัตโนมัติ'}</ConfirmDialog>}
  </article>;
}
