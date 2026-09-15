import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from './api.js';
import './admin-dashboard.css';
const actions={EDIT_COURSE:'แก้ไขข้อมูลรายวิชา',COURSE_STATUS:'เปลี่ยนการแสดงรายวิชา',MERGE_COURSES:'รวมรายวิชา'};
const number=n=>Number(n).toLocaleString('th-TH');
export default function AdminDashboard(){
  const [data,setData]=useState(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');api('/admin/dashboard',{signal:controller.signal}).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[refresh]);
  const c=data?.counts;
  return <section className="ad-dashboard">
    <header className="ad-header"><div><h1>ภาพรวมระบบ</h1><p className="muted">ตรวจสถานะข้อมูล และเลือกสิ่งที่ต้องจัดการต่อ</p></div><div className="cc-actions"><button className="btn-ghost" disabled={loading} onClick={()=>setRefresh(x=>x+1)}>{loading?'กำลังโหลด…':'รีเฟรชข้อมูล'}</button><Link className="btn" to="/admin">จัดการรายวิชา →</Link></div></header>
    {error&&<p className="alert alert-error" role="alert">{error}</p>}
    {!data&&loading&&<p role="status">กำลังโหลดภาพรวมระบบ…</p>}
    {data&&<><div className="ad-stats">
      {[[ 'ผู้ใช้ทั้งหมด',c.users,`รวมบัญชีทดลอง ${number(c.mock_users)} บัญชี`],['รายวิชาปัจจุบัน',Number(c.active_courses)+Number(c.inactive_courses),`เปิด ${number(c.active_courses)} · ปิด ${number(c.inactive_courses)} · ไม่รวมรายการที่รวมแล้ว`],['รีวิวสถานะใช้งาน',c.active_reviews,`ถูกซ่อน ${number(c.hidden_reviews)} รีวิว`],['ไฟล์สถานะใช้งาน',c.active_files,`ถูกซ่อน ${number(c.hidden_files)} ไฟล์`]].map(([label,value,note])=><article className="card ad-stat" key={label}><p>{label}</p><strong>{number(value)}</strong><small>{note}</small></article>)}
    </div><p className="muted ad-note">รีวิวและไฟล์นับตามสถานะเนื้อหา รวมรายการภายในวิชาที่ปิดแสดง ไม่รวมรายการที่ลบหรือเก็บถาวร</p>
    <div className="ad-columns"><article className="card"><div className="ad-section-title"><h2>รายวิชาที่อาจซ้ำ</h2><span className="ad-badge">{number(data.duplicate_groups)} กลุ่ม</span></div><p className="muted">รหัสเดียวกันในมหาวิทยาลัยเดียวกัน อาจเป็นคนละเทอมหรือผู้สอน ควรตรวจสอบก่อนรวม</p>
      {data.duplicates.length?<ul className="ad-list">{data.duplicates.map(g=><li key={`${g.university_id}-${g.code_normalized}`}><div><strong>{g.course_code}</strong><p className="muted">{number(g.course_count)} รายวิชา</p></div><Link to={`/admin?code=${encodeURIComponent(g.course_code)}`}>ตรวจสอบ →</Link></li>)}</ul>:<div className="ad-empty">ยังไม่พบกลุ่มรายวิชารหัสซ้ำ</div>}
      {data.duplicate_groups>10&&<p className="muted">แสดง 10 กลุ่มที่มีรายการมากที่สุด</p>}</article>
      <article className="card"><h2>การจัดการล่าสุด</h2><p className="muted">การแก้ไข เปิด/ปิด และรวมรายวิชา 15 รายการล่าสุด</p>{data.activity.length?<ul className="ad-list">{data.activity.map(a=><li key={a.log_id}><div><strong>{actions[a.action]}</strong><p className="muted">{a.actor} · {new Date(a.timestamp).toLocaleString('th-TH')}</p></div>{a.target_id&&<Link to={`/course/${a.target_id}`}>วิชา #{a.target_id}</Link>}</li>)}</ul>:<div className="ad-empty">ยังไม่มีประวัติการจัดการรายวิชา</div>}</article></div></>}
  </section>;
}
