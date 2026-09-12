import {useEffect,useRef,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {api} from '../api.js';
import {useAuth} from '../AuthContext.jsx';
import {loginPath} from './CourseUI.jsx';
import ActionMenu from './ActionMenu.jsx';
import {ConfirmDialog} from './Modal.jsx';

export default function CommentThread({basePath,onChanged}){
  const {user}=useAuth(),location=useLocation(),editRef=useRef(null);
  const [items,setItems]=useState([]),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [editing,setEditing]=useState(null),[editText,setEditText]=useState(''),[reported,setReported]=useState([]),[confirm,setConfirm]=useState(null);
  async function load(){const data=await api(`${basePath}/comments`);setItems(data.comments);}
  useEffect(()=>{const c=new AbortController();setLoading(true);setError('');api(`${basePath}/comments`,{signal:c.signal}).then(data=>setItems(data.comments)).catch(err=>{if(err.name!=='AbortError')setError(err.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[basePath]);
  useEffect(()=>{if(editing!=null)editRef.current?.focus();},[editing]);
  async function action(path,method,body,done){
    if(busy)return;setBusy(true);setError('');
    try{
      await api(path,{method,body});done?.();setConfirm(null);
      try{await load();await onChanged?.();}catch(err){setError('บันทึกแล้ว แต่โหลดความคิดเห็นล่าสุดไม่สำเร็จ กรุณาปิดและเปิดความคิดเห็นใหม่');}
    }catch(err){setError(err.message);}finally{setBusy(false);}
  }
  return <div className="comments-list ux-comments">
    {loading?<p role="status" className="ux-comments-empty">กำลังโหลดความคิดเห็น…</p>:!items.length&&!error&&<p className="ux-comments-empty">ยังไม่มีความคิดเห็น เริ่มพูดคุยเกี่ยวกับเนื้อหานี้ได้เลย</p>}
    {items.map(c=><article className="ux-comment" key={c.comment_id}>
      <div className="ux-comment-heading"><div><Link to={`/profile/${c.author_id}`}>{c.author_name}</Link><time className="cc-date" dateTime={c.created_at+'Z'}>{new Date(c.created_at+'Z').toLocaleDateString('th-TH')}</time></div>
        {user&&<ActionMenu label={`ตัวเลือกความคิดเห็นของ ${c.author_name}`}>{user.user_id===c.author_id?<><button type="button" disabled={busy} onClick={()=>{setEditing(c.comment_id);setEditText(c.content);}}>แก้ไขความคิดเห็น</button><button type="button" className="ux-danger" disabled={busy} onClick={()=>{setError('');setConfirm({type:'delete',id:c.comment_id});}}>ลบความคิดเห็น</button></>:<button type="button" disabled={busy||reported.includes(c.comment_id)} onClick={()=>{setError('');setConfirm({type:'report',id:c.comment_id});}}>{reported.includes(c.comment_id)?'รายงานแล้ว':'รายงานความคิดเห็น'}</button>}</ActionMenu>}
      </div>
      {editing===c.comment_id?<form className="ux-comments-form" onSubmit={e=>{e.preventDefault();action(`${basePath}/comments/${c.comment_id}`,'PUT',{content:editText.trim()},()=>setEditing(null));}}><label>แก้ไขความคิดเห็น<textarea ref={editRef} required rows={2} maxLength={2000} disabled={busy} value={editText} onChange={e=>setEditText(e.target.value)}/></label><div className="cc-actions"><button type="button" className="btn-ghost" disabled={busy} onClick={()=>setEditing(null)}>ยกเลิก</button><button disabled={busy||!editText.trim()}>บันทึกการแก้ไข</button></div></form>:<p className="cc-secondary-content">{c.content}</p>}
    </article>)}
    {error&&!confirm&&<p role="alert" className="alert alert-error">{error}</p>}
    {user?<form className="ux-comments-form" onSubmit={e=>{e.preventDefault();action(`${basePath}/comments`,'POST',{content:text.trim()},()=>setText(''));}}><label>แสดงความคิดเห็น<textarea value={text} required maxLength={2000} rows={2} disabled={busy} onChange={e=>setText(e.target.value)} placeholder="พูดคุยหรือสอบถามเกี่ยวกับเนื้อหานี้…"/></label><button disabled={busy||!text.trim()}>{busy?'กำลังบันทึก…':'ส่งความคิดเห็น'}</button></form>:<Link to={loginPath(location.pathname+location.search)}>เข้าสู่ระบบเพื่อแสดงความคิดเห็น</Link>}
    {confirm&&<ConfirmDialog title={confirm.type==='delete'?'ลบความคิดเห็นนี้?':'รายงานความคิดเห็นนี้?'} confirmLabel={confirm.type==='delete'?'ยืนยันลบความคิดเห็น':'ยืนยันรายงาน'} busy={busy} error={error} onClose={()=>setConfirm(null)} onConfirm={()=>action(`${basePath}/comments/${confirm.id}${confirm.type==='report'?'/report':''}`,confirm.type==='delete'?'DELETE':'POST',undefined,()=>{if(confirm.type==='report')setReported(prev=>[...prev,confirm.id]);})}>{confirm.type==='delete'?'ความคิดเห็นนี้จะไม่แสดงใต้เนื้อหาอีกต่อไป':'ใช้เมื่อพบเนื้อหาที่ไม่เหมาะสม เมื่อครบ 5 บัญชีจะซ่อนเฉพาะความคิดเห็นนี้ ไม่ซ่อนรีวิวหรือไฟล์หลัก'}</ConfirmDialog>}
  </div>;
}
