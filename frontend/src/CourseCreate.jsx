import { useRef,useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import CourseForm,{coursePayload,numericPayload} from './components/CourseForm.jsx';
import { useCatalogOptions,semesterLabel,teacherNames } from './components/CourseUI.jsx';

export default function CourseCreate(){
  const {options,error:optionError}=useCatalogOptions();
  const [form,setForm]=useState(coursePayload());
  const [preview,setPreview]=useState(null);
  const [result,setResult]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [duplicate,setDuplicate]=useState(null);
  const [knownTeachers,setKnownTeachers]=useState([]);
  const [teacherError,setTeacherError]=useState('');const formRef=useRef(null);
  async function submit(event,confirm=false){
    event?.preventDefault();setError('');setBusy(true);
    try{
      if(!form.instructor_ids.length){setTeacherError('กรุณาเลือกผู้สอนอย่างน้อยหนึ่งคน');setPreview(null);requestAnimationFrame(()=>formRef.current?.querySelector('[data-teacher-search]')?.focus());return;}
      const data=await api(confirm?'/courses':'/courses/preview',{method:'POST',body:numericPayload(form)});
      if(confirm)setResult(data);else{setPreview(data);setDuplicate(data.duplicate);setKnownTeachers(data.course.instructors || []);}
    }catch(err){setError(err.message);if(err.detail?.course_id)setDuplicate(err.detail.duplicate || {course_id:err.detail.course_id});}finally{setBusy(false);}
  }
  if(result)return <section className="card ux-create-success"><span className="ux-created-icon" aria-hidden="true">✓</span><h1>สร้างรายวิชาเรียบร้อย</h1><p>{form.course_code} · {form.course_name}</p><p className="muted">วิชาถูกบันทึกแล้ว อยากแบ่งปันประสบการณ์เป็นรีวิวแรกเลยไหม?</p><div className="cc-actions"><Link className="btn" to={`/course/${result.course_id}?review=1`}>เขียนรีวิวเลย</Link><Link className="btn btn-ghost" to={`/course/${result.course_id}`}>ไว้ภายหลัง · ดูรายวิชา</Link></div></section>;
  return <section><Link className="back-link" to="/">← กลับไปรายวิชา</Link><div className="ux-page-heading"><div><div className="ux-eyebrow">เพิ่มข้อมูลให้ชุมชน · สจล.</div><h1>สร้างรายวิชา</h1><p>ระบุปี เทอม และผู้สอนให้ตรงกับรายการที่ต้องการแบ่งปัน</p></div></div><div className="ux-form-stepper"><span>{!preview?<strong>1. กรอกข้อมูล</strong>:'1. กรอกข้อมูล'}</span><span aria-hidden="true">→</span><span>{preview?<strong>2. ตรวจสอบและยืนยัน</strong>:'2. ตรวจสอบและยืนยัน'}</span></div>
    {(error || optionError) && <p className="alert alert-error" role="alert">{error || optionError}</p>}
    {!options?<p>กำลังโหลดตัวเลือก…</p>:<form ref={formRef} onSubmit={e=>submit(e)} className="card">
      {!preview?<CourseForm value={form} onChange={next=>{setForm(next);setTeacherError('');}} teacherError={teacherError} options={options} initialTeachers={knownTeachers} disabled={busy} />:<div className="cc-preview"><h2>ตรวจสอบก่อนสร้าง</h2><dl>{[['มหาวิทยาลัย','สจล. (KMITL)'],['คณะ',preview.course.faculty_name],['สาขา',preview.course.department],['วิชา',`${form.course_code} · ${form.course_name}`],['ปี / เทอม',`${form.academic_year} · ${semesterLabel(form.semester)}`],['หน่วยกิต',form.credits],['ผู้สอน',teacherNames(preview.course.instructors || knownTeachers)],['คำอธิบาย',form.syllabus || '–'],['รายละเอียดเพิ่มเติม',form.additional_details || '–']].map(([key,val])=><div key={key}><dt>{key}</dt><dd>{val}</dd></div>)}</dl>
        <h3>รายการที่อาจเกี่ยวข้อง</h3>{preview.similar_courses.length?preview.similar_courses.map(c=><p key={c.course_id}><Link to={`/course/${c.course_id}`}>{c.course_code} {c.course_name} · {c.academic_year}/{c.semester}</Link></p>):<p className="muted">ไม่พบรายการใกล้เคียง</p>}
        <p>ถ้าชื่อหรือปี เทอม ผู้สอนต่างกัน สร้างแยกได้ ไม่เปรียบเทียบคำอธิบายเพื่อแบ่งรายการ</p></div>}
      {duplicate && <p className="cc-info">มีรายการนี้แล้ว <Link to={`/course/${duplicate.course_id}`}>เปิดรายวิชาเดิม →</Link></p>}
      <div className="ux-form-end"><p>หลังสร้างแล้ว แก้ข้อมูลได้เฉพาะแอดมิน</p>{preview?<><button className="btn-ghost" type="button" disabled={busy} onClick={()=>{setPreview(null);setDuplicate(null);}}>กลับไปแก้ข้อมูล</button><button type="button" disabled={busy || !!duplicate} onClick={()=>submit(null,true)}>{busy?'กำลังบันทึก…':'ยืนยันสร้างวิชา'}</button></>:<button disabled={busy}>{busy?'กำลังตรวจสอบ…':'ถัดไป · ตรวจสอบข้อมูล'}</button>}</div>
    </form>}
  </section>;
}
