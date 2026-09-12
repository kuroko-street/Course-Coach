import {useCallback,useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {api} from './api.js';
import {CatalogFilters,CourseCard,useCatalogOptions} from './components/CourseUI.jsx';
import {emptyFilters,patchQuery,readFilters} from './lib/catalogQuery.js';

export default function Home(){
  const [params,setParams]=useSearchParams();const {options,error:optionError}=useCatalogOptions();
  const search=params.get('search')||'',query=params.toString();
  const [draft,setDraft]=useState(search),[data,setData]=useState({courses:[],total:0}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const page=Math.max(1,Number(params.get('page'))||1),values=readFilters(params);
  const change=useCallback(patch=>setParams(prev=>patchQuery(prev,patch)),[setParams]);
  useEffect(()=>setDraft(search),[search]);
  useEffect(()=>{if(draft===search)return;const timer=setTimeout(()=>setParams(prev=>patchQuery(prev,{search:draft}),{replace:true}),300);return()=>clearTimeout(timer);},[draft,search,setParams]);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');api(`/courses?${query}`,{signal:controller.signal}).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[query,retry]);
  function reset(){setDraft('');change({...emptyFilters(),search:''});}
  return <section><div className="ux-page-heading"><div><div className="ux-eyebrow">COURSE COACH · สจล.</div><h1>ค้นหารายวิชาที่ใช่</h1><p>อ่านประสบการณ์จากผู้เรียน เลือกปี เทอม และผู้สอนให้ตรงกัน</p></div><Link className="btn btn-ghost" to="/courses/new">+ สร้างรายวิชา</Link></div>
    <form onSubmit={e=>{e.preventDefault();change({search:draft});}}><label htmlFor="course-search" className="ux-search-label">ค้นหารหัส ชื่อวิชา อาจารย์ หรือแท็ก</label><div className="ux-search-box"><input id="course-search" type="search" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="เช่น Introduction Com หรือ คอม" maxLength={300}/>{draft&&<button type="button" className="ux-search-clear" aria-label="ล้างคำค้น" onClick={()=>{setDraft('');change({search:''});}}>×</button>}</div></form>
    <CatalogFilters options={options} values={values} onChange={change}/>
    {(error||optionError)&&<div className="alert alert-error ux-inline-error" role="alert"><span>{error||optionError}</span>{error&&<button className="btn-ghost" type="button" onClick={()=>setRetry(x=>x+1)}>ลองใหม่</button>}</div>}
    <div className="ux-result-heading"><p aria-live="polite">{loading?'กำลังค้นหา…':`พบ ${data.total} รายการวิชา`}</p><span className="meta">{search?'เรียงตามความเกี่ยวข้อง':''}</span></div>
    <div className={`course-grid ${loading?'cc-refreshing':''}`} aria-busy={loading}>{data.courses.map(c=><CourseCard key={c.course_id} course={c}/>)}</div>
    {!loading&&!error&&!data.courses.length&&<div className="card ux-empty"><h3>ยังไม่พบวิชาที่ตรงกับเงื่อนไข</h3><p>ลองใช้คำสั้นลง หรือล้างตัวกรองเพื่อค้นหาในปีและเทอมอื่น</p><div className="cc-actions"><button type="button" onClick={reset}>ล้างคำค้นและตัวกรอง</button><Link className="btn btn-ghost" to="/courses/new">ตรวจแล้วไม่มี? สร้างรายวิชา</Link></div></div>}
    {!error&&data.total>20&&<nav className="cc-pagination ux-pagination" aria-label="หน้าผลการค้นหา"><button disabled={loading||page<=1} onClick={()=>setParams(prev=>patchQuery(prev,{page:page-1},false))}>ก่อนหน้า</button><span>หน้า {page} / {Math.max(1,Math.ceil(data.total/(data.page_size||20)))}</span><button disabled={loading||page*(data.page_size||20)>=data.total} onClick={()=>setParams(prev=>patchQuery(prev,{page:page+1},false))}>ถัดไป</button></nav>}
    <p className="ux-page-note">ข้อมูลและความคิดเห็นมาจากผู้ใช้ ไม่ใช่ข้อมูลรับรองจากมหาวิทยาลัย · คะแนนนับหนึ่งรีวิวที่แสดงต่อบัญชีต่อรายการวิชา</p>
  </section>;
}
