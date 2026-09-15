import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {api} from './api.js';
import CourseForm,{coursePayload,numericPayload} from './components/CourseForm.jsx';
import {CatalogFilters,CourseContext,useCatalogOptions} from './components/CourseUI.jsx';

const FIELD_LABELS={course_code:'รหัส',course_name:'ชื่อวิชา',faculty_id:'คณะ',department_id:'สาขา',academic_year:'ปี',semester:'เทอม',credits:'หน่วยกิต',instructor_ids:'ชุดผู้สอน',syllabus:'คำอธิบาย',additional_details:'รายละเอียดเพิ่มเติม'};
export default function Admin(){
  const [searchParams]=useSearchParams();
  const {options,error:optionsError}=useCatalogOptions();
  const [filters,setFilters]=useState({});const [search,setSearch]=useState('');const [code,setCode]=useState(searchParams.get('code') || '');const [page,setPage]=useState(1);
  const [data,setData]=useState({courses:[],total:0});const [selected,setSelected]=useState([]);const [mode,setMode]=useState(null);
  const [primary,setPrimary]=useState(null);const [form,setForm]=useState(coursePayload());const [reason,setReason]=useState('');const [keep,setKeep]=useState([]);
  const [preview,setPreview]=useState(null);const [requestId,setRequestId]=useState('');const [history,setHistory]=useState([]);
  const [keepReviews,setKeepReviews]=useState([]);const [acceptOverage,setAcceptOverage]=useState(false);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');const [refresh,setRefresh]=useState(0);
  const qs=new URLSearchParams({search,code,page,page_size:50});Object.entries(filters).forEach(([k,v])=>{if(Array.isArray(v))v.forEach(x=>qs.append(k,x));else if(v!=='')qs.set(k,v);});const query=qs.toString();
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>{api(`/admin/courses?${query}`,{signal:controller.signal}).then(setData).catch(err=>{if(err.name!=='AbortError')setError(err.message);});},250);return()=>{clearTimeout(timer);controller.abort();};},[query,refresh]);
  useEffect(()=>{api('/admin/merge-history').then(r=>setHistory(r.history)).catch(err=>setError(err.message));},[refresh]);
  function pick(c){if(selected.some(x=>x.course_id===c.course_id))setSelected(prev=>prev.filter(x=>x.course_id!==c.course_id));else if(selected.length<21)setSelected(prev=>[...prev,c]);else setError('รวมได้สูงสุด 21 รายการต่อครั้ง');}
  function start(nextMode,c){setMode(nextMode);setPrimary(c.course_id);setForm(coursePayload(c));setPreview(null);setKeep([]);setKeepReviews([]);setAcceptOverage(false);setReason('');setError('');setMessage('');}
  function editForm(next){setForm(next);setPreview(null);}
  function mergeBody(){return {primary_course_id:primary,source_course_ids:selected.filter(c=>c.course_id!==primary).map(c=>c.course_id),final_course:numericPayload(form),reason:reason.trim(),keep_plan_item_ids:keep,keep_review_ids:keepReviews,accept_file_overage:acceptOverage};}
  async function save(e){e.preventDefault();setBusy(true);setError('');setMessage('');try{
    if(!form.instructor_ids.length)throw new Error('เลือกผู้สอนอย่างน้อยหนึ่งคน');
    if(mode==='edit'){await api(`/admin/courses/${primary}`,{method:'PUT',body:numericPayload(form)});setMode(null);setSelected([]);setRefresh(x=>x+1);setMessage('บันทึกข้อมูลวิชาแล้ว');}
    else{const result=await api('/admin/courses/merge/preview',{method:'POST',body:mergeBody()});setPreview(result);setRequestId(crypto.randomUUID());}
  }catch(err){setError(err.message);}finally{setBusy(false);}}
  async function confirm(){if(!window.confirm('ยืนยันรวมรายการตามข้อมูลที่ตรวจแล้ว? รายการต้นทางจะพาไปยังรายการหลัก และการย้อนกลับต้องใช้ประวัติ/สำเนาสำรอง'))return;setBusy(true);setError('');try{
    const result=await api('/admin/courses/merge',{method:'POST',body:{...mergeBody(),preview_token:preview.preview_token,request_id:requestId}});
    setMessage(`รวมสำเร็จ รายการหลัก #${result.course_id} · ประวัติ #${result.merge_id}`);setMode(null);setSelected([]);setRefresh(x=>x+1);
  }catch(err){setError(err.message);}finally{setBusy(false);}}
  async function status(c){if(!window.confirm(`${c.is_active?'ปิด':'เปิด'}แสดงวิชานี้? การปิดจะซ่อนเนื้อหาที่อยู่ภายในจากหน้าสาธารณะด้วย`))return;setBusy(true);try{await api(`/admin/courses/${c.course_id}/status`,{method:'PATCH',body:{is_active:!c.is_active}});setRefresh(x=>x+1);}catch(err){setError(err.message);}finally{setBusy(false);}}
  const selectedPrimary=selected.find(c=>c.course_id===primary);
  const planChoicesComplete=preview?.plan_conflicts.every(c=>c.item_ids.filter(id=>keep.includes(id)).length===1);
  const reviewChoicesComplete=preview?.review_conflicts.every(c=>c.reviews.filter(r=>keepReviews.includes(r.review_id)).length===1);
  return <section><h1>จัดการข้อมูลรายวิชา</h1><p className="cc-info">แอดมินแก้ข้อมูลหรือรวมรายการซ้ำเป็นกรณีพิเศษ ไม่ต้องตรวจรีวิวและไฟล์ทีละรายการ เนื้อหาที่ถูกรายงานครบ 5 บัญชีจะถูกซ่อนอัตโนมัติ</p>
    {(error || optionsError)&&<p className="alert alert-error" role="alert">{error || optionsError}</p>}{message&&<p className="alert alert-success" role="status">{message}</p>}
    {mode&&options?<form className="card" onSubmit={save}>
      <h2>{mode==='merge'?'รวมรายการวิชา':'แก้ข้อมูลรายวิชา'} #{primary}</h2>
      {mode==='merge'&&<><label>รายการหลัก (ใช้ URL นี้ต่อ)<select value={primary} onChange={e=>{const c=selected.find(x=>x.course_id===Number(e.target.value));setPrimary(c.course_id);editForm(coursePayload(c));setKeep([]);}}>{selected.map(c=><option key={c.course_id} value={c.course_id}>#{c.course_id} {c.course_code} {c.course_name} ({c.academic_year}/{c.semester})</option>)}</select></label><p>เลือกข้อมูลที่จะเก็บเป็นรายช่อง หรือปรับในฟอร์มด้านล่าง ชุดผู้สอนไม่ถูกรวมอัตโนมัติ</p><div className="cc-form-grid">{Object.entries(FIELD_LABELS).map(([key,label])=><label key={key}>{label}: คัดลอกจาก<select value="" onChange={e=>{const c=selected.find(x=>x.course_id===Number(e.target.value));if(c)editForm({...form,[key]:coursePayload(c)[key]});}}><option value="">เลือกต้นทาง</option>{selected.map(c=><option key={c.course_id} value={c.course_id}>#{c.course_id} · {c.course_name}</option>)}</select></label>)}</div></>}
      <CourseForm key={`${mode}-${primary}`} value={form} onChange={editForm} options={options} initialTeachers={mode==='merge'?selected.flatMap(c=>c.instructors):selectedPrimary?.instructors || []} disabled={busy}/>
      {mode==='merge'&&<label>เหตุผลที่ควรเป็นรายการเดียวกัน<textarea required minLength={5} maxLength={2000} value={reason} onChange={e=>{setReason(e.target.value);setPreview(null);}}/></label>}
      <div className="cc-actions"><button disabled={busy}>{busy?'กำลังตรวจสอบ…':mode==='merge'?'ตรวจผลกระทบก่อนรวม':'บันทึกการแก้ไข'}</button><button type="button" className="btn-ghost" disabled={busy} onClick={()=>setMode(null)}>ยกเลิก</button></div>
      {preview&&<div className="cc-info"><h3>ผลก่อนรวม</h3><p>รีวิว {preview.counts.reviews} · ไฟล์ {preview.counts.files} · รายการในแผน {preview.counts.plans}</p><p>เก็บผลงานและสถานะเดิม ไม่คืน HIDDEN หรือ DELETED กลับมาแสดง</p>{preview.warnings.map((w,i)=><p className="alert alert-error" key={i}>{w}</p>)}
        {preview.plan_conflicts.map(c=><fieldset key={`${c.plan_id}-${c.academic_year}-${c.semester}`}><legend>แผน #{c.plan_id} ปี {c.academic_year} เทอม {c.semester}: เลือกเก็บหนึ่งรายการ</legend><p>รายการเหล่านี้จะกลายเป็นวิชาเดียวกันในเทอมเดียวกัน เก็บประวัติรายการที่ตัดซ้ำไว้ในบันทึกการรวม</p>{c.item_ids.map(id=><label key={id} style={{display:'block'}}><input type="radio" style={{width:'auto'}} name={`plan-${c.plan_id}-${c.academic_year}-${c.semester}`} checked={keep.includes(id)} onChange={()=>{setKeep(prev=>[...prev.filter(x=>!c.item_ids.includes(x)),id]);setPreview(prev=>({...prev,stale:true}));}}/> เก็บรายการ #{id}</label>)}</fieldset>)}
        {preview.review_conflicts.map(c=><fieldset key={c.reviewer_id}><legend>บัญชี #{c.reviewer_id} มีรีวิวซ้ำหลังรวม: เลือกหนึ่งรีวิวให้แสดง</legend><p>รีวิวที่ไม่เลือกจะเป็น ARCHIVED เก็บข้อความ คะแนน ไลก์ ความคิดเห็นและรายงานไว้ในประวัติ แต่ไม่แสดงและไม่นับคะแนน/แท็ก</p>{c.reviews.map(r=><label key={r.review_id} style={{display:'block',marginBottom:12}}><input type="radio" style={{width:'auto'}} name={`review-${c.reviewer_id}`} checked={keepReviews.includes(r.review_id)} onChange={()=>{setKeepReviews(prev=>[...prev.filter(id=>!c.reviews.some(x=>x.review_id===id)),r.review_id]);setPreview(prev=>({...prev,stale:true}));}}/> รีวิว #{r.review_id} จากวิชา #{r.course_id} · พึงพอใจ {r.rating_satisfaction}/5<p className="cc-secondary-content">{r.content}</p></label>)}</fieldset>)}
        {preview.file_overages.length>0&&<div><h4>ไฟล์รวมแล้วเกินโควต้า</h4>{preview.file_overages.map(c=><p key={c.user_id}>บัญชี #{c.user_id} · ใช้อยู่ {c.used} / พักสิทธิ์ {c.held}</p>)}<label><input type="checkbox" style={{width:'auto'}} checked={acceptOverage} onChange={e=>{setAcceptOverage(e.target.checked);setPreview(prev=>({...prev,stale:true}));}}/> ยืนยันเก็บไฟล์เดิมครบ ไม่ลบอัตโนมัติ และงดอัปเพิ่มจนมีช่องว่าง</label></div>}
        <p>การพักสิทธิ์ที่มีอยู่จะย้ายตามมาวิชาหลัก ไม่ถูกล้างจากการรวม</p>
        {preview.stale&&<p>ตัวเลือกเปลี่ยนแล้ว กด “ตรวจผลกระทบก่อนรวม” อีกครั้ง</p>}<button type="button" disabled={busy || preview.stale || !planChoicesComplete || !reviewChoicesComplete || (preview.file_overages.length>0&&!acceptOverage)} onClick={confirm}>ยืนยันรวมตามผลตรวจนี้</button>
      </div>}
    </form>:<>
      <div className="cc-form-grid"><label>ค้นหา<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label><label>รหัสเดียวกันแบบตรงตัว<input value={code} onChange={e=>{setCode(e.target.value);setPage(1);}} placeholder="เช่น 06016301"/></label></div>
      <CatalogFilters options={options} values={filters} onChange={patch=>{setFilters(prev=>({...prev,...patch}));setPage(1);}}/>
      <div className="cc-actions"><span>พบ {data.total} รายการ · เลือก {selected.length}</span><button disabled={selected.length<2} onClick={()=>start('merge',selected[0])}>รวมรายการที่เลือก</button><button className="btn-ghost" onClick={()=>setSelected([])}>ล้างที่เลือก</button></div>
      {data.courses.map(c=><div className="card" key={c.course_id} style={{marginTop:12}}><label><input type="checkbox" style={{width:'auto'}} checked={selected.some(x=>x.course_id===c.course_id)} onChange={()=>pick(c)}/> #{c.course_id} · <strong>{c.course_code} {c.course_name}</strong></label><CourseContext course={c}/><div className="cc-actions"><Link to={`/course/${c.course_id}`}>ดูรายวิชา</Link><span>{c.is_active?'เปิดแสดง':'ปิดแสดง'}</span><button className="btn-ghost" onClick={()=>{setSelected([c]);start('edit',c);}}>แก้ข้อมูล</button><button className="btn-ghost" disabled={busy} onClick={()=>status(c)}>{c.is_active?'ปิดแสดง':'เปิดแสดง'}</button></div></div>)}
      <div className="cc-pagination"><button disabled={page<=1} onClick={()=>setPage(x=>x-1)}>ก่อนหน้า</button><span>หน้า {page}</span><button disabled={page*50>=data.total} onClick={()=>setPage(x=>x+1)}>ถัดไป</button></div>
    </>}
    <h2>ประวัติการรวมล่าสุด</h2>{history.length?history.map(h=><p className="card" key={h.merge_id}>#{h.merge_id} · {h.source_course_ids.join(', ')} → <Link to={`/course/${h.primary_course_id}`}>#{h.primary_course_id}</Link> · {h.reason}</p>):<p className="muted">ยังไม่มีการรวมรายวิชา</p>}
  </section>;
}
