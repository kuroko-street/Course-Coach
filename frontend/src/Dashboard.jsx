import {useEffect,useState} from 'react';
import {Link,useLocation,useSearchParams} from 'react-router-dom';
import {api} from './api.js';
import {RATING_FIELDS,RATING_SHORT_LABELS} from './RatingStars.jsx';
import {CatalogFilters,CourseContext,useCatalogOptions} from './components/CourseUI.jsx';
import {dashboardState,emptyFilters,filterQuery,patchQuery,readFilters} from './lib/catalogQuery.js';

export default function Dashboard(){
  const [params,setParams]=useSearchParams(),location=useLocation();const {options,error:optionError}=useCatalogOptions();
  const filters=readFilters(params),{tab,aspect,min}=dashboardState(params),metric=tab==='aspects'?aspect:tab;
  const query=filterQuery(filters),rankQuery=`${query}&metric=${metric}&min_reviews=${min}`;
  const [summary,setSummary]=useState({query:null,value:{}}),[rank,setRank]=useState({query:null,rows:[]}),[error,setError]=useState(''),[summaryError,setSummaryError]=useState(''),[retry,setRetry]=useState(0);
  const loading=rank.query!==rankQuery;
  function change(patch){setParams(prev=>patchQuery(prev,patch));}
  useEffect(()=>{const c=new AbortController();setSummaryError('');api(`/dashboard/summary?${query}`,{signal:c.signal}).then(r=>setSummary({query,value:r.summary})).catch(e=>{if(e.name!=='AbortError')setSummaryError(e.message);});return()=>c.abort();},[query,retry]);
  useEffect(()=>{const c=new AbortController();setError('');api(`/dashboard/rankings?${rankQuery}`,{signal:c.signal}).then(r=>setRank({query:rankQuery,rows:r.rankings})).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>c.abort();},[rankQuery,retry]);
  const description=tab==='reviews'?'เรียงจากจำนวนรีวิวที่ยังแสดง มากไปน้อย':tab==='likes'?'เรียงจากยอดถูกใจของรีวิวที่ยังแสดง ไม่ใช่ยอดเข้าชม':`เรียงตามคะแนนเฉลี่ยด้าน${RATING_SHORT_LABELS[aspect]} ไม่รวมคะแนนทุกด้านเข้าด้วยกัน`;
  return <section className="cc-dashboard ux-dashboard"><div className="ux-page-heading"><div><div className="ux-eyebrow">COURSE COACH · สจล.</div><h1>อันดับรายวิชา</h1><p>ดูแนวโน้มจากผู้รีวิว แยกตามปี เทอม และผู้สอนของแต่ละรายการ</p></div></div>
    <CatalogFilters options={options} values={filters} onChange={change} advanced={false}/>
    <div className="dashboard-summary-grid">{[['course_count','รายการวิชา'],['review_count','รีวิวที่แสดง'],['reviewer_count','บัญชีผู้รีวิวไม่ซ้ำ'],['total_likes','ยอดถูกใจรีวิว']].map(([key,label])=><div className="card dashboard-summary-card" key={key}><strong>{summary.query!==query?'—':summary.value[key]??0}</strong><span>{label}</span></div>)}</div><p className="small muted">ภาพรวมตามตัวกรองด้านบน · รีวิวขั้นต่ำใช้กับรายการจัดอันดับด้านล่างเท่านั้น</p>
    <div className="ux-rank-panel"><div className="ux-tabs" aria-label="รูปแบบการจัดอันดับ">{[['reviews','รีวิวมากที่สุด'],['likes','ได้รับความสนใจ'],['aspects','คะแนนรายด้าน']].map(([id,label])=><button type="button" key={id} aria-pressed={tab===id} onClick={()=>change({tab:id})}>{label}</button>)}</div>
      <div className="ux-rank-controls"><div>{tab==='aspects'?<label>ด้านที่จัดอันดับ<select value={aspect} onChange={e=>change({aspect:e.target.value})}>{RATING_FIELDS.map(a=><option key={a} value={a}>{RATING_SHORT_LABELS[a]}</option>)}</select></label>:<div className="ux-rank-criterion"><span>เกณฑ์ที่ใช้จัดอันดับ</span><strong>{tab==='reviews'?'จำนวนรีวิวที่แสดง':'ยอดถูกใจของรีวิว'}</strong></div>}</div><label>รีวิวขั้นต่ำต่อวิชา<input type="number" min="0" max="1000000" inputMode="numeric" value={min} onChange={e=>change({min_reviews:Math.min(1000000,Math.max(0,Math.floor(Number(e.target.value)||0)))})}/></label></div>
      <p className="ux-rank-description">{description}</p>
      {(error||summaryError||optionError)&&<div role="alert" className="alert alert-error ux-inline-error"><span>{error||summaryError||optionError}</span><button type="button" className="btn-ghost" onClick={()=>setRetry(x=>x+1)}>ลองใหม่</button></div>}
      <p className="ux-refresh-note" aria-live="polite">{error?'โหลดอันดับไม่สำเร็จ':loading?'กำลังปรับอันดับ…':`${rank.rows.length} รายการ · แสดงสูงสุด 100 รายการ`}</p>
      <div className={`ux-ranking-list ${loading?'cc-refreshing':''}`} aria-busy={loading&&!error}>{rank.rows.map((c,index)=><div className="card ux-ranking-card" key={c.course_id}><span className="ux-rank-number">{index+1}</span><div className="ux-rank-body"><Link to={`/course/${c.course_id}`} state={{from:location.pathname+location.search}}>{c.course_code} · {c.course_name}</Link><CourseContext course={c}/><span className="meta">{c.review_count} รีวิว · ความพึงพอใจ {c.avg_satisfaction==null?'ยังไม่มีคะแนน':`${Number(c.avg_satisfaction).toFixed(2)}/5`}</span></div><div className="ux-rank-value"><strong>{loading?'—':c.metric_value==null?'—':tab==='aspects'?Number(c.metric_value).toFixed(2):c.metric_value}</strong><span>{loading?'กำลังโหลด':tab==='aspects'?'คะแนน / 5':tab==='likes'?'ถูกใจ':'รีวิว'}</span></div></div>)}
      {!loading&&!rank.rows.length&&<div className="card ux-empty"><h3>ยังไม่มีอันดับตรงตามเงื่อนไข</h3><p>ลองลดจำนวนรีวิวขั้นต่ำ หรือเลือกปีและเทอมอื่น</p><button type="button" className="btn-ghost" onClick={()=>change({...emptyFilters(),min_reviews:0})}>ล้างตัวกรองและรีวิวขั้นต่ำ</button></div>}</div>
    </div><p className="ux-page-note">หนึ่งบัญชีมีหนึ่งรีวิวที่แสดงต่อรายการวิชา คะแนนมีน้ำหนักเท่ากัน · ไม่รวมทุกเทอมของรหัสวิชาเดียวกัน</p>
  </section>;
}
