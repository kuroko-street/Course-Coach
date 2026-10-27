import ExpandableText from './components/ExpandableText.jsx';
import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {api} from './api.js';
import CourseForm,{coursePayload,numericPayload} from './components/CourseForm.jsx';
import {CatalogFilters,CourseContext,useCatalogOptions} from './components/CourseUI.jsx';
import {useToast} from './components/ToastProvider.jsx';
import {ConfirmDialog} from './components/Modal.jsx';
import MergeHistory from './components/MergeHistory.jsx';
import {reviewChoicesForStrategy} from './mergeReviewSelection.js';
import {formatThaiDateTime} from './lib/dateTime.js';

const FIELD_LABELS={course_code:'รหัส',course_name:'ชื่อวิชา',faculty_id:'คณะ',department_id:'สาขา',academic_year:'ปี',semester:'เทอม',credits:'หน่วยกิต',instructor_ids:'ชุดผู้สอน',syllabus:'คำอธิบาย',additional_details:'รายละเอียดเพิ่มเติม'};
export default function Admin(){
  const toast=useToast();
  const [statusTarget,setStatusTarget]=useState(null);
  const [mergeConfirmOpen,setMergeConfirmOpen]=useState(false);
  const [searchParams]=useSearchParams();
  const {options,error:optionsError}=useCatalogOptions();
  const [filters,setFilters]=useState({});const [search,setSearch]=useState('');const [code,setCode]=useState(searchParams.get('code') || '');const [page,setPage]=useState(1);
  const [data,setData]=useState({courses:[],total:0});const [selected,setSelected]=useState([]);const [mode,setMode]=useState(null);
  const [primary,setPrimary]=useState(null);const [form,setForm]=useState(coursePayload());const [copiedFrom,setCopiedFrom]=useState({});const [reason,setReason]=useState('');const [keep,setKeep]=useState([]);
  const [preview,setPreview]=useState(null);const [requestId,setRequestId]=useState('');const [history,setHistory]=useState([]);
  const [keepReviews,setKeepReviews]=useState([]);const [reviewSelectionMode,setReviewSelectionMode]=useState('manual');const [fileSelectionMode,setFileSelectionMode]=useState(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [refresh,setRefresh]=useState(0);
  const qs=new URLSearchParams({search,code,page,page_size:50});Object.entries(filters).forEach(([k,v])=>{if(Array.isArray(v))v.forEach(x=>qs.append(k,x));else if(v!=='')qs.set(k,v);});const query=qs.toString();
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>{api(`/admin/courses?${query}`,{signal:controller.signal}).then(setData).catch(err=>{if(err.name!=='AbortError')setError(err.message);});},250);return()=>{clearTimeout(timer);controller.abort();};},[query,refresh]);
  useEffect(()=>{api('/admin/merge-history').then(r=>setHistory(r.history)).catch(err=>setError(err.message));},[refresh]);
  function pick(c){if(selected.some(x=>x.course_id===c.course_id))setSelected(prev=>prev.filter(x=>x.course_id!==c.course_id));else if(selected.length<21)setSelected(prev=>[...prev,c]);else toast.info('เลือกได้สูงสุด 21 รายการต่อครั้ง');}
  function start(nextMode,c){setMode(nextMode);setPrimary(c.course_id);setForm(coursePayload(c));setCopiedFrom({});setPreview(null);setKeep([]);setKeepReviews([]);setReviewSelectionMode('manual');setFileSelectionMode(null);setReason('');setError('');}
  function editForm(next){
    if(mode==='merge')setCopiedFrom(prev=>{
      const updated={...prev};
      Object.keys(FIELD_LABELS).forEach(key=>{if(JSON.stringify(next[key])!==JSON.stringify(form[key]))updated[key]='manual';});
      return updated;
    });
    setForm(next);setPreview(null);
  }
  function copyField(key,courseId){const c=selected.find(x=>x.course_id===Number(courseId));if(!c)return;setForm(prev=>({...prev,[key]:coursePayload(c)[key]}));setCopiedFrom(prev=>({...prev,[key]:c.course_id}));setPreview(null);}
  function mergeBody(){return {primary_course_id:primary,source_course_ids:selected.filter(c=>c.course_id!==primary).map(c=>c.course_id),final_course:numericPayload(form),reason:reason.trim(),keep_plan_item_ids:keep,keep_review_ids:keepReviews,file_selection_mode:fileSelectionMode};}
  async function save(e){e.preventDefault();setBusy(true);setError('');try{
    if(!form.instructor_ids.length)throw new Error('เลือกผู้สอนอย่างน้อยหนึ่งคน');
    if(mode==='edit'){await api(`/admin/courses/${primary}`,{method:'PUT',body:numericPayload(form)});setMode(null);setSelected([]);setRefresh(x=>x+1);toast.success('บันทึกข้อมูลวิชาแล้ว');}
    else{
      const body=mergeBody();
      let result=await api('/admin/courses/merge/preview',{method:'POST',body});
      if(reviewSelectionMode!=='manual'){
        const choices=reviewChoicesForStrategy(result.review_conflicts,reviewSelectionMode,primary);
        if(JSON.stringify(choices.slice().sort((a,b)=>a-b))!==JSON.stringify(body.keep_review_ids.slice().sort((a,b)=>a-b))){
          result=await api('/admin/courses/merge/preview',{method:'POST',body:{...body,keep_review_ids:choices}});
        }
        setKeepReviews(choices);
      }
      setPreview(result);setRequestId(crypto.randomUUID());
    }
  }catch(err){setError(err.message);}finally{setBusy(false);}}
  async function chooseReviewStrategy(nextStrategy){
    if(nextStrategy==='manual'){setReviewSelectionMode('manual');return;}
    const choices=reviewChoicesForStrategy(preview.review_conflicts,nextStrategy,primary);
    if(JSON.stringify(choices.slice().sort((a,b)=>a-b))===JSON.stringify(keepReviews.slice().sort((a,b)=>a-b)) && !preview.stale){setReviewSelectionMode(nextStrategy);return;}
    setBusy(true);setError('');
    try{
      const result=await api('/admin/courses/merge/preview',{method:'POST',body:{...mergeBody(),keep_review_ids:choices}});
      setKeepReviews(choices);setReviewSelectionMode(nextStrategy);setPreview(result);setRequestId(crypto.randomUUID());
    }catch(err){setError(err.message);}finally{setBusy(false);}
  }
  function chooseReview(conflict,reviewId){
    setReviewSelectionMode('manual');
    setKeepReviews(prev=>[...prev.filter(id=>!conflict.reviews.some(review=>review.review_id===id)),reviewId]);
    setPreview(prev=>({...prev,stale:true}));
  }
  async function confirm(){setBusy(true);setError('');try{
    const result=await api('/admin/courses/merge',{method:'POST',body:{...mergeBody(),preview_token:preview.preview_token,request_id:requestId}});
    setMergeConfirmOpen(false);toast.success('รวมรายวิชาแล้ว',`รายการหลัก #${result.course_id} · ประวัติ #${result.merge_id}`);setMode(null);setSelected([]);setRefresh(x=>x+1);
  }catch(err){setError(err.message);}finally{setBusy(false);}}
  async function status(c){setBusy(true);setError('');try{await api(`/admin/courses/${c.course_id}/status`,{method:'PATCH',body:{is_active:!c.is_active}});setStatusTarget(null);setRefresh(x=>x+1);toast.success(c.is_active?'ปิดแสดงรายวิชาแล้ว':'เปิดแสดงรายวิชาแล้ว');}catch(err){toast.error('เปลี่ยนสถานะไม่สำเร็จ',err.message);}finally{setBusy(false);}}
  const selectedPrimary=selected.find(c=>c.course_id===primary);
  const planChoicesComplete=preview?.plan_conflicts.every(c=>c.item_ids.filter(id=>keep.includes(id)).length===1);
  const reviewChoicesComplete=preview?.review_conflicts.every(c=>c.reviews.filter(r=>keepReviews.includes(r.review_id)).length===1);
  return <section className="admin-courses-page"><h1>จัดการข้อมูลรายวิชา</h1><p className="cc-info">แอดมินแก้ข้อมูลหรือรวมรายการซ้ำเป็นกรณีพิเศษ ไม่ต้องตรวจรีวิวและไฟล์ทีละรายการ เนื้อหาที่ถูกรายงานครบ 5 บัญชีจะถูกซ่อนอัตโนมัติ</p>
    {(error || optionsError)&&<p className="alert alert-error" role="alert">{error || optionsError}</p>}
    {mode&&options?<form className={`card admin-course-editor ${mode==='merge'?'admin-merge-editor':''}`} onSubmit={save}>
      <h2>{mode==='merge'?'รวมรายการวิชา':'แก้ข้อมูลรายวิชา'} #{primary}</h2>
      {mode==='merge'&&<><label>รายการหลัก (ใช้ URL นี้ต่อ)<select value={primary} onChange={e=>{const c=selected.find(x=>x.course_id===Number(e.target.value));setPrimary(c.course_id);setForm(coursePayload(c));setCopiedFrom({});setPreview(null);setKeep([]);setKeepReviews([]);setReviewSelectionMode('manual');}}>{selected.map(c=><option key={c.course_id} value={c.course_id}>#{c.course_id} {c.course_code} {c.course_name} ({c.academic_year}/{c.semester})</option>)}</select></label><p>เลือกข้อมูลที่จะเก็บเป็นรายช่องจากวิชาอื่นที่เลือกไว้ หรือปรับในฟอร์มด้านล่าง ชุดผู้สอนไม่ถูกรวมอัตโนมัติ</p><div className="cc-form-grid">{Object.entries(FIELD_LABELS).map(([key,label])=><label key={key}>{label}: คัดลอกจาก<select value={copiedFrom[key]??primary} onChange={e=>copyField(key,e.target.value)} disabled={busy}><option value={primary}>#{primary} · {selectedPrimary?.course_name} (รายการหลัก)</option><option value="manual" disabled>ปรับเองในฟอร์ม</option>{selected.filter(c=>c.course_id!==primary).map(c=><option key={c.course_id} value={c.course_id}>#{c.course_id} · {c.course_name}</option>)}</select></label>)}</div></>}
      <CourseForm key={`${mode}-${primary}`} value={form} onChange={editForm} options={options} initialTeachers={mode==='merge'?selected.flatMap(c=>c.instructors):selectedPrimary?.instructors || []} disabled={busy}/>
      {mode==='merge'&&<label>เหตุผลที่ควรเป็นรายการเดียวกัน<textarea required minLength={5} maxLength={2000} value={reason} onChange={e=>{setReason(e.target.value);setPreview(null);}}/></label>}
      {preview&&<div className="cc-info"><h3>ผลก่อนรวม</h3><p>รีวิว {preview.counts.reviews} · ไฟล์ {preview.counts.files} · รายการในแผน {preview.counts.plans}</p><p>เก็บผลงานและสถานะเดิม ไม่คืน HIDDEN หรือ DELETED กลับมาแสดง</p>{preview.warnings.map((w,i)=><p className="alert alert-error" key={i}>{w}</p>)}
        {preview.plan_conflicts.map(c=><fieldset key={`${c.plan_id}-${c.academic_year}-${c.semester}`}><legend>แผน #{c.plan_id} ปี {c.academic_year} เทอม {c.semester}: เลือกเก็บหนึ่งรายการ</legend><p>รายการเหล่านี้จะกลายเป็นวิชาเดียวกันในเทอมเดียวกัน เก็บประวัติรายการที่ตัดซ้ำไว้ในบันทึกการรวม</p>{c.item_ids.map(id=><label key={id} style={{display:'block'}}><input type="radio" style={{width:'auto'}} name={`plan-${c.plan_id}-${c.academic_year}-${c.semester}`} checked={keep.includes(id)} onChange={()=>{setKeep(prev=>[...prev.filter(x=>!c.item_ids.includes(x)),id]);setPreview(prev=>({...prev,stale:true}));}}/> เก็บรายการ #{id}</label>)}</fieldset>)}
        {preview.review_conflicts.length>0&&<div className="admin-review-strategy"><h4>รีวิวซ้ำหลังรวม</h4><p>เลือกวิธีเลือกว่ารีวิวไหนจะยังแสดงอยู่ต่อหนึ่งบัญชี</p><div className="admin-review-strategy-options" role="group" aria-label="วิธีเลือกรีวิวที่จะเก็บ">{[['latest','รีวิวใหม่ที่สุด'],['primary','วิชาหลักเป็นหลัก'],['manual','เลือกเอง']].map(([value,label])=><button key={value} type="button" className={reviewSelectionMode===value?'is-active':''} aria-pressed={reviewSelectionMode===value} disabled={busy} onClick={()=>chooseReviewStrategy(value)}>{label}</button>)}</div><p className="admin-review-strategy-hint">{reviewSelectionMode==='primary'?'ถ้าบัญชีใดไม่มีรีวิวในวิชาหลัก จะใช้รีวิวใหม่ที่สุดแทน':reviewSelectionMode==='manual'?'เลือกรีวิวที่จะแสดงสำหรับแต่ละบัญชีจากรายการด้านล่าง':'เทียบวันที่สร้างรีวิว หากวันเดียวกันใช้หมายเลขรีวิวล่าสุด'}</p></div>}
        {preview.review_conflicts.map(c=>{const selectedReview=c.reviews.find(r=>keepReviews.includes(r.review_id));return <fieldset className="admin-review-conflict" key={c.reviewer_id}><legend>บัญชี #{c.reviewer_id} มีรีวิวซ้ำหลังรวม</legend><label>รีวิวที่จะแสดง<select value={selectedReview?.review_id??''} disabled={busy} onChange={e=>chooseReview(c,Number(e.target.value))}><option value="" disabled>เลือกรีวิว</option>{c.reviews.map(r=><option key={r.review_id} value={r.review_id}>รีวิว #{r.review_id} · วิชา #{r.course_id}{r.course_id===primary?' (วิชาหลัก)':''}</option>)}</select></label>{selectedReview&&<><p className="admin-review-selected-meta">{formatThaiDateTime(selectedReview.created_at,{dateStyle:'short',timeStyle:'short'})} · พึงพอใจ {selectedReview.rating_satisfaction}/5</p><ExpandableText key={selectedReview.review_id} text={selectedReview.content} limit={300} className="admin-review-selected-content"/></>}<p className="admin-review-archive-note">รีวิวอื่นจะเก็บในประวัติ โดยไม่แสดงและไม่นับคะแนนหรือแท็ก</p></fieldset>;})}
        {preview.file_overages.length>0&&<div className="admin-review-strategy">
          <h4>ไฟล์รวมแล้วเกินโควต้า</h4><p>เลือกวิธีจัดการสำหรับทุกบัญชีที่เกิน 3 ช่อง ไฟล์ที่ไม่เก็บจะอยู่ในประวัติและไม่แสดง</p>
          <div className="admin-review-strategy-options" role="group" aria-label="วิธีจัดการไฟล์เกินโควต้า">{[['latest','ใหม่ที่สุด'],['primary','วิชาหลักเป็นหลัก'],['reset','คืนสิทธิ']].map(([value,label])=><button key={value} type="button" disabled={busy} aria-pressed={fileSelectionMode===value} className={fileSelectionMode===value?'is-active':''} onClick={()=>{setFileSelectionMode(value);setPreview(prev=>({...prev,stale:true}));}}>{label}</button>)}</div>
          <p>{fileSelectionMode==='reset'?'เก็บไฟล์เดิมของบัญชีที่เกินเป็นประวัติ และคืนช่องอัปโหลดครบ 3 ไฟล์ รวมถึงช่องพักสิทธิ์ไฟล์':fileSelectionMode==='primary'?'เก็บไฟล์วิชาหลักก่อน เติมช่องที่เหลือด้วยไฟล์ใหม่ที่สุด โดยยังหักช่องพักสิทธิ์':'เก็บไฟล์ใหม่ที่สุดตามเวลาอัปโหลด โดยยังหักช่องพักสิทธิ์'}</p>
          {preview.file_overages.map(c=>{const r=preview.file_resolution?.find(x=>x.user_id===c.user_id);return <p key={c.user_id}>บัญชี #{c.user_id} · ไฟล์เดิม {c.used} · พักสิทธิ์ {c.held}{!preview.stale&&fileSelectionMode&&r&&` → เก็บ ${r.keep_file_ids.length} · ประวัติ ${r.archive_file_ids.length} · พักสิทธิ์ ${r.held}`}</p>;})}
        </div>}
        <p>การพักสิทธิ์จะย้ายตามมาวิชาหลัก ยกเว้นช่องพักสิทธิ์ไฟล์ของบัญชีที่เลือกคืนสิทธิ</p>
        {preview.stale&&<p>ตัวเลือกเปลี่ยนแล้ว กด “ตรวจผลกระทบก่อนรวม” อีกครั้ง</p>}
      </div>}
      <div className="cc-actions"><button type="submit" disabled={busy}>{busy?'กำลังตรวจสอบ…':mode==='merge'?'ตรวจผลกระทบก่อนรวม':'บันทึกการแก้ไข'}</button>{mode==='merge'&&preview&&<button type="button" disabled={busy || preview.stale || !planChoicesComplete || !reviewChoicesComplete || (preview.file_overages.length>0&&!fileSelectionMode)} onClick={()=>setMergeConfirmOpen(true)}>ยืนยันรวมตามผลตรวจนี้</button>}<button type="button" className="btn-ghost" disabled={busy} onClick={()=>setMode(null)}>ยกเลิก</button></div>
    </form>:<>
      <div className="cc-form-grid"><label>ค้นหา<input type="search" maxLength={300} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label><label>รหัสเดียวกันแบบตรงตัว<input maxLength={30} value={code} onChange={e=>{setCode(e.target.value);setPage(1);}} placeholder="เช่น 06016301"/></label></div>
      <CatalogFilters options={options} values={filters} onChange={patch=>{setFilters(prev=>({...prev,...patch}));setPage(1);}}/>
      <div className="cc-actions admin-selection-bar"><span>พบ {data.total} รายการ · เลือก {selected.length}</span><button disabled={selected.length<2} onClick={()=>start('merge',selected[0])}>รวมรายการที่เลือก</button><button className="btn-ghost" onClick={()=>setSelected([])}>ล้างที่เลือก</button></div>
      {data.courses.map(c=><div className="card admin-course-row" key={c.course_id} style={{marginTop:12}}><label><input type="checkbox" style={{width:'auto'}} checked={selected.some(x=>x.course_id===c.course_id)} onChange={()=>pick(c)}/> #{c.course_id} · <strong>{c.course_code} {c.course_name}</strong></label><CourseContext course={c}/><div className="cc-actions"><Link to={`/course/${c.course_id}`}>ดูรายวิชา</Link><span>{c.is_active?'เปิดแสดง':'ปิดแสดง'}</span><button className="btn-ghost" onClick={()=>{setSelected([c]);start('edit',c);}}>แก้ข้อมูล</button><button className="btn-ghost" disabled={busy} onClick={()=>setStatusTarget(c)}>{c.is_active?'ปิดแสดง':'เปิดแสดง'}</button></div></div>)}
      <div className="cc-pagination"><button disabled={page<=1} onClick={()=>setPage(x=>x-1)}>ก่อนหน้า</button><span>หน้า {page}</span><button disabled={page*50>=data.total} onClick={()=>setPage(x=>x+1)}>ถัดไป</button></div>
    </>}
    <MergeHistory history={history}/>
    {mergeConfirmOpen&&<ConfirmDialog title="ยืนยันรวมรายวิชา?" confirmLabel="ยืนยันรวมรายวิชา" busy={busy} error={error} onClose={()=>setMergeConfirmOpen(false)} onConfirm={confirm}>รวมรายการตามข้อมูลและผลตรวจสอบที่เลือกไว้ รายการต้นทางจะพาไปยังรายการหลัก การย้อนกลับต้องใช้ประวัติหรือสำเนาสำรอง</ConfirmDialog>}
    {statusTarget&&<ConfirmDialog title={statusTarget.is_active?'ปิดแสดงรายวิชานี้?':'เปิดแสดงรายวิชานี้?'} confirmLabel={statusTarget.is_active?'ยืนยันปิดแสดง':'ยืนยันเปิดแสดง'} busy={busy} onClose={()=>setStatusTarget(null)} onConfirm={()=>status(statusTarget)}>{statusTarget.is_active?'การปิดแสดงจะซ่อนรายวิชาและเนื้อหาภายในจากหน้าสาธารณะ คุณสามารถเปิดแสดงอีกครั้งได้ภายหลัง':'รายวิชาและเนื้อหาที่แสดงได้ภายในจะกลับมาปรากฏในหน้าสาธารณะ'}</ConfirmDialog>}
  </section>;
}
