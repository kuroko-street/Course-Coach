import {useEffect,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {api} from '../api.js';
import {emptyFilters} from '../lib/catalogQuery.js';
import '../community.css';
export {Modal} from './Modal.jsx';
export const semesterLabel=value=>value==='summer'||value==='3'?'ภาคฤดูร้อน':`เทอม ${value||'–'}`;
export const teacherNames=(items=[])=>items.map(item=>typeof item==='string'?item:item.name).join(', ');
export const loginPath=path=>`/login?next=${encodeURIComponent(path)}`;
export const courseSubtitle=course=>course?`${course.course_code} · ${course.course_name} · ${course.academic_year} / ${semesterLabel(course.semester)}`:'';
export function CourseContext({course}){
  return <div className="cc-context"><span>ปี {course.academic_year||'–'} · {semesterLabel(course.semester)} · {course.credits??'–'} หน่วยกิต</span><span>ผู้สอน: {teacherNames(course.instructors)||'–'}</span></div>;
}
export function CourseCard({course}){
  const location=useLocation();const score=course.avg_satisfaction??course.avg_rating??course.averages?.avg_satisfaction;
  const count=Number(course.review_count??course.averages?.review_count)||0;
  return <Link to={`/course/${course.course_id}`} state={{from:location.pathname+location.search}} className="card course-card ux-course-card">
    <div className="ux-card-top"><span className="ux-card-code">{course.course_code}</span><span className="ux-term-pill">{course.academic_year} · {semesterLabel(course.semester)}</span></div>
    <strong className="ux-card-title">{course.course_name}</strong><div className="meta">{course.faculty_name||course.faculty} · {course.department_name||course.department}</div>
    <div className="cc-context"><span>ผู้สอน: {teacherNames(course.instructors)||'–'}</span><span>{course.credits??'–'} หน่วยกิต</span></div>
    <div className="tag-chips">{(course.tags||[]).slice(0,3).map(tag=><span className="tag-chip tag-chip-static" key={tag.tag_id||tag}>#{tag.tag_name||tag}</span>)}</div>
    <div className="ux-card-footer"><div>{score!=null?<><div className="ux-card-score"><span aria-hidden="true">★</span><strong>{Number(score).toFixed(2)}</strong><span>/ 5</span></div><span className="meta">ความพึงพอใจ</span></>:<span className="meta">ยังไม่มีคะแนน</span>}</div><span className="meta">{count} รีวิว <span aria-hidden="true">→</span></span></div>
  </Link>;
}
export function useCatalogOptions(){
  const [options,setOptions]=useState(null),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();api('/catalog/options',{signal:controller.signal}).then(setOptions).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[]);
  return {options,error};
}
export function TagPicker({tags=[],selected=[],onChange,mutuallyExclusive=true}){
  function toggle(tag){
    if(selected.map(Number).includes(Number(tag.tag_id)))return onChange(selected.filter(id=>Number(id)!==Number(tag.tag_id)));
    let next=selected;
    if(mutuallyExclusive&&['งานเยอะ','งานไม่มาก'].includes(tag.tag_name)){
      const opposite=tags.find(item=>['งานเยอะ','งานไม่มาก'].includes(item.tag_name)&&item.tag_id!==tag.tag_id);
      next=next.filter(id=>Number(id)!==Number(opposite?.tag_id));
    }
    onChange([...next,tag.tag_id]);
  }
  return <div className="tag-chips cc-tag-picker">{tags.map(tag=><button key={tag.tag_id} type="button" aria-pressed={selected.map(Number).includes(Number(tag.tag_id))} className="tag-chip tag-chip-button" onClick={()=>toggle(tag)}>#{tag.tag_name}</button>)}</div>;
}
export function CatalogFilters({options,values,onChange,advanced=true}){
  const [instructors,setInstructors]=useState([]),[known,setKnown]=useState({}),[query,setQuery]=useState(''),[error,setError]=useState('');
  const [mobileOpen,setMobileOpen]=useState(false),[advancedOpen,setAdvancedOpen]=useState(false);
  const ids=(values.instructor_ids||[]).map(String),tags=(values.tag_ids||[]).map(String);
  const selectedKey=ids.join(',');
  useEffect(()=>{
    if(!advanced)return;const controller=new AbortController();
    const timer=setTimeout(()=>api(`/instructors?search=${encodeURIComponent(query)}`,{signal:controller.signal}).then(data=>{setInstructors(data.instructors||[]);setKnown(prev=>({...prev,...Object.fromEntries((data.instructors||[]).map(t=>[t.instructor_id,t.name]))}));setError('');}).catch(e=>{if(e.name!=='AbortError')setError('โหลดรายชื่อผู้สอนไม่สำเร็จ ลองพิมพ์ค้นหาอีกครั้ง');}),250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,advanced]);
  useEffect(()=>{
    if(!advanced)return;const controller=new AbortController();
    for(const id of ids.filter(id=>!known[id]))api(`/instructors/${id}/profile`,{signal:controller.signal}).then(data=>setKnown(prev=>({...prev,[id]:data.instructor.name}))).catch(()=>{});
    return()=>controller.abort();
  },[selectedKey,advanced]);
  if(!options)return <div className="cc-filters ux-filters muted" aria-live="polite">กำลังโหลดตัวกรอง…</div>;
  const departments=(options.departments||[]).filter(item=>!values.faculty_id||String(item.faculty_id)===String(values.faculty_id));
  const chips=[];
  for(const [key,label,list,idKey,nameKey] of [['faculty_id','คณะ',options.faculties,'faculty_id','name'],['department_id','สาขา',options.departments,'department_id','name']])if(values[key])chips.push({key,value:values[key],label:list?.find(item=>String(item[idKey])===String(values[key]))?.[nameKey]||label});
  if(values.academic_year)chips.push({key:'academic_year',label:`ปี ${values.academic_year}`});
  if(values.semester)chips.push({key:'semester',label:semesterLabel(values.semester)});
  for(const id of ids)chips.push({key:'instructor_ids',value:id,label:known[id]||`ผู้สอน #${id}`});
  for(const id of tags)chips.push({key:'tag_ids',value:id,label:'#'+(options.tags?.find(t=>String(t.tag_id)===id)?.tag_name||id)});
  function remove(chip){onChange(chip.key.endsWith('_ids')?{[chip.key]:(values[chip.key]||[]).filter(id=>String(id)!==chip.value)}:chip.key==='faculty_id'?{faculty_id:'',department_id:''}:{[chip.key]:''});}
  return <div className="cc-filters ux-filters"><button type="button" className="ux-filter-mobile-toggle" aria-expanded={mobileOpen} aria-controls="catalog-filter-controls" onClick={()=>setMobileOpen(!mobileOpen)}>ตัวกรองรายวิชา <span>{chips.length?`${chips.length} เงื่อนไข · `:''}{mobileOpen?'ย่อ ↑':'เลือกตัวกรอง ↓'}</span></button>
    <div id="catalog-filter-controls" className={`ux-filter-body ${mobileOpen?'is-open':''}`}><div className="cc-filter-grid">
      <label>คณะ<select value={values.faculty_id||''} onChange={e=>onChange({faculty_id:e.target.value,department_id:''})}><option value="">ทุกคณะ</option>{options.faculties?.map(f=><option key={f.faculty_id} value={f.faculty_id}>{f.name}</option>)}</select></label>
      <label>สาขา<select value={values.department_id||''} onChange={e=>onChange({department_id:e.target.value})}><option value="">ทุกสาขา</option>{departments.map(d=><option key={d.department_id} value={d.department_id}>{d.name}</option>)}</select></label>
      <label>ปีการศึกษา<select value={values.academic_year||''} onChange={e=>onChange({academic_year:e.target.value})}><option value="">ทุกปี</option>{options.academic_years?.map(y=><option key={y} value={y}>{y}</option>)}</select></label>
      <label>ภาคเรียน<select value={values.semester||''} onChange={e=>onChange({semester:e.target.value})}><option value="">ทุกเทอม</option>{['1','2','summer'].map(s=><option key={s} value={s}>{semesterLabel(s)}</option>)}</select></label>
    </div>
    {advanced&&<details className="ux-filter-advanced" open={advancedOpen} onToggle={e=>setAdvancedOpen(e.currentTarget.open)}><summary>ตัวกรองเพิ่มเติม · ผู้สอนและแท็ก{ids.length+tags.length>0?` (${ids.length+tags.length})`:''}</summary>
      <label>ค้นหาชื่อผู้สอน<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="พิมพ์ชื่ออาจารย์ แล้วเลือกรายชื่อ"/></label>
      {error&&<p className="ux-field-error" role="alert">{error}</p>}<div className="cc-teacher-options">{instructors.map(item=><label key={item.instructor_id}><input type="checkbox" checked={ids.includes(String(item.instructor_id))} onChange={e=>onChange({instructor_ids:e.target.checked?[...ids,String(item.instructor_id)]:ids.filter(id=>id!==String(item.instructor_id))})}/>{item.name}{item.affiliation?` · ${item.affiliation}`:''}</label>)}{!instructors.length&&!error&&<span className="muted small">ไม่พบชื่อผู้สอนที่ตรงกับคำค้นนี้</span>}</div>
      <p className="small muted">ผู้สอนหลายคน: พบคนใดคนหนึ่ง · แท็กหลายข้อ: ต้องพบครบทุกข้อในรีวิวของรายวิชา</p><TagPicker tags={options.tags} selected={tags} onChange={tag_ids=>onChange({tag_ids:tag_ids.map(String)})} mutuallyExclusive={false}/>
    </details>}</div>
    {chips.length>0&&<div className="ux-active-filters" aria-label="ตัวกรองที่เลือก">{chips.map(chip=><button type="button" className="ux-filter-chip" key={chip.key+(chip.value||'')} aria-label={`เอาตัวกรอง ${chip.label} ออก`} onClick={()=>remove(chip)}>{chip.label} <span aria-hidden="true">×</span></button>)}<button type="button" className="ux-link-button" onClick={()=>{onChange(emptyFilters());setQuery('');}}>ล้างตัวกรองทั้งหมด</button></div>}
  </div>;
}
