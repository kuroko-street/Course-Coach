import {useEffect,useId,useRef,useState} from 'react';
import {api} from '../api.js';
import {semesterLabel} from './CourseUI.jsx';
import {Modal} from './Modal.jsx';

export function coursePayload(course={}){
  return {university_id:1,faculty_id:course.faculty_id||'',department_id:course.department_id||'',course_code:course.course_code||'',course_name:course.course_name||'',credits:course.credits??'',academic_year:course.academic_year||new Date().getFullYear()+543,semester:course.semester||'1',instructor_ids:course.instructor_ids||(course.instructors||[]).map(x=>x.instructor_id),syllabus:course.syllabus||'',additional_details:course.additional_details||''};
}
export function numericPayload(form){return {...form,university_id:1,faculty_id:Number(form.faculty_id),department_id:Number(form.department_id),credits:Number(form.credits),academic_year:Number(form.academic_year),instructor_ids:form.instructor_ids.map(Number)};}

function AddTeacher({initialName,onClose,onAdded}){
  const id=useId(),formRef=useRef(null),[name,setName]=useState(initialName),[affiliation,setAffiliation]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();e.stopPropagation();if(busy)return;setBusy(true);setError('');try{const data=await api('/instructors',{method:'POST',body:{name:name.trim(),affiliation:affiliation.trim()||null}});onAdded(data.instructor);onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <Modal title="เพิ่มชื่ออาจารย์" subtitle="เพิ่มรายชื่อผู้สอน ไม่ใช่สร้างบัญชีเข้าสู่ระบบ" onClose={onClose} busy={busy} dirty={name!==initialName||!!affiliation} footer={<><button className="btn-ghost" type="button" disabled={busy} onClick={()=>formRef.current?.closest('[role="dialog"]')?.querySelector('.modal-close')?.click()}>ยกเลิก</button><button type="submit" form={id} disabled={busy||name.trim().length<2}>{busy?'กำลังเพิ่ม…':'เพิ่มและเลือกผู้สอน'}</button></>}><form ref={formRef} id={id} onSubmit={submit}><label>ชื่อ–นามสกุลผู้สอน *<input required autoComplete="off" minLength={2} maxLength={255} value={name} onChange={e=>setName(e.target.value)} disabled={busy}/></label><label>สังกัด <span className="muted">(ถ้าทราบ)</span><input maxLength={255} value={affiliation} onChange={e=>setAffiliation(e.target.value)} disabled={busy} placeholder="เช่น ภาควิชาวิทยาการคอมพิวเตอร์ สจล."/></label><p className="ux-form-hint">ชื่อนี้จะถูกบันทึกในรายชื่อผู้สอนของระบบ โปรดตรวจชื่อเดิมก่อนเพิ่มเพื่อหลีกเลี่ยงข้อมูลซ้ำ</p>{error&&<p role="alert" className="alert alert-error">{error}</p>}</form></Modal>;
}
export default function CourseForm({value,onChange,options,initialTeachers=[],disabled=false,teacherError=''}){
  const [query,setQuery]=useState(''),[teachers,setTeachers]=useState(initialTeachers),[known,setKnown]=useState(initialTeachers),[error,setError]=useState(''),[adding,setAdding]=useState(false),[loading,setLoading]=useState(false);
  const set=(key,val)=>onChange({...value,[key]:val}),selected=value.instructor_ids.map(Number);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);
    const timer=setTimeout(()=>api(`/instructors?search=${encodeURIComponent(query)}`,{signal:controller.signal}).then(data=>{setTeachers(data.instructors);setKnown(prev=>Array.from(new Map([...prev,...data.instructors].map(x=>[x.instructor_id,x])).values()));setError('');}).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);}),250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query]);
  const departments=(options?.departments||[]).filter(d=>String(d.faculty_id)===String(value.faculty_id));
  return <fieldset className="ux-course-form" disabled={disabled} style={{border:0,padding:0,margin:0,minWidth:0}}>
    <fieldset className="ux-form-block"><legend>1. ข้อมูลวิชา</legend><p className="ux-university">มหาวิทยาลัย: สจล. (KMITL) · ช่องที่มี * จำเป็นต้องกรอก</p><div className="cc-form-grid">
      <label>คณะ *<select required value={value.faculty_id} onChange={e=>onChange({...value,faculty_id:e.target.value,department_id:''})}><option value="">เลือกคณะ</option>{options?.faculties.map(f=><option key={f.faculty_id} value={f.faculty_id}>{f.name}</option>)}</select></label>
      <label>สาขาที่รับผิดชอบ *<select required disabled={!value.faculty_id||disabled} value={value.department_id} onChange={e=>set('department_id',e.target.value)}><option value="">{value.faculty_id?'เลือกสาขา':'เลือกคณะก่อน'}</option>{departments.map(d=><option key={d.department_id} value={d.department_id}>{d.name}</option>)}</select></label>
      <label>รหัสวิชา *<input required maxLength={30} value={value.course_code} onChange={e=>set('course_code',e.target.value)} placeholder="เช่น 06016301"/><span className="ux-form-hint">กรอกตามรหัสจริง รวมเลขศูนย์ด้านหน้า</span></label>
      <label>หน่วยกิตรวม *<input type="number" required min="0.1" max="30" step="0.1" value={value.credits} onChange={e=>set('credits',e.target.value)} placeholder="เช่น 3"/></label>
      <label className="cc-wide">ชื่อวิชา *<input required minLength={2} maxLength={255} value={value.course_name} onChange={e=>set('course_name',e.target.value)} placeholder="ใช้ชื่อเต็มตามรายวิชา"/></label>
    </div></fieldset>
    <fieldset className="ux-form-block"><legend>2. ปี เทอม และผู้สอน</legend><div className="cc-form-grid">
      <label>ปีการศึกษา (พ.ศ.) *<select value={value.academic_year} onChange={e=>set('academic_year',e.target.value)}>{Array.from(new Set([...(options?.academic_years||[]),Number(value.academic_year)])).sort((a,b)=>b-a).map(y=><option key={y} value={y}>{y}</option>)}</select></label>
      <label>ภาคเรียน *<select value={value.semester} onChange={e=>set('semester',e.target.value)}>{['1','2','summer'].map(s=><option key={s} value={s}>{semesterLabel(s)}</option>)}</select></label>
      <div className="cc-wide"><label>ผู้สอน * <span className="muted">เลือกได้หลายคน</span><input data-teacher-search value={query} aria-invalid={!!teacherError} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหาชื่ออาจารย์ แล้วกดเลือกจากรายชื่อ" maxLength={255}/></label>
        {selected.length>0&&<><p className="ux-form-hint">เลือกแล้ว {selected.length} คน</p><div className="ux-selected-teachers">{selected.map(id=><button key={id} type="button" aria-label={`เอาผู้สอน ${known.find(t=>Number(t.instructor_id)===id)?.name||id} ออก`} onClick={()=>set('instructor_ids',selected.filter(x=>x!==id))}>{known.find(t=>Number(t.instructor_id)===id)?.name||`ผู้สอน #${id}`} <span aria-hidden="true">×</span></button>)}</div></>}
        <div className="cc-teacher-options" aria-live="polite">{loading?<span className="small muted">กำลังค้นหาผู้สอน…</span>:teachers.filter(t=>!selected.includes(Number(t.instructor_id))).map(t=><button className="btn-ghost" type="button" key={t.instructor_id} onClick={()=>set('instructor_ids',[...selected,Number(t.instructor_id)])}>+ {t.name}{t.affiliation?` · ${t.affiliation}`:''}</button>)}{!loading&&!teachers.filter(t=>!selected.includes(Number(t.instructor_id))).length&&<span className="small muted">{query?'ไม่พบรายชื่ออื่นที่ตรงกับคำค้น':'เลือกรายชื่อที่มีครบแล้ว หรือเพิ่มผู้สอนที่ยังไม่มีในระบบ'}</span>}</div>
        <div className="ux-teacher-create"><span className="muted">ค้นหาแล้วไม่พบชื่อที่ต้องการ?</span><button type="button" className="btn-ghost" onClick={()=>setAdding(true)}>+ เพิ่มอาจารย์ใหม่</button></div>
        {(teacherError||error)&&<p role="alert" className="ux-field-error">{teacherError||error}</p>}
      </div>
    </div></fieldset>
    <fieldset className="ux-form-block"><legend>3. รายละเอียดเพิ่มเติม <span className="muted small">ไม่บังคับ</span></legend><div className="cc-form-grid"><label className="cc-wide">คำอธิบาย / หัวข้อที่เรียน<textarea rows={3} maxLength={15000} value={value.syllabus} onChange={e=>set('syllabus',e.target.value)} placeholder="เนื้อหาหรือหัวข้อหลักของวิชา"/></label><label className="cc-wide">ข้อมูลเพิ่มเติม<textarea rows={2} maxLength={15000} value={value.additional_details} onChange={e=>set('additional_details',e.target.value)} placeholder="ข้อมูลอื่นที่เป็นประโยชน์ต่อผู้สนใจ"/></label></div></fieldset>
    {adding&&<AddTeacher initialName={query.trim()} onClose={()=>setAdding(false)} onAdded={teacher=>{setKnown(prev=>Array.from(new Map([...prev,teacher].map(t=>[t.instructor_id,t])).values()));set('instructor_ids',Array.from(new Set([...selected,teacher.instructor_id])));setQuery('');}}/>}
  </fieldset>;
}
