import {useEffect,useState} from 'react';
import {Link,useLocation,useSearchParams} from 'react-router-dom';
import {api} from './api.js';
import {RATING_FIELDS,RATING_SHORT_LABELS} from './RatingStars.jsx';
import {CatalogFilters,CourseContext,useCatalogOptions} from './components/CourseUI.jsx';
import {dashboardState,emptyFilters,filterQuery,patchQuery,readFilters} from './lib/catalogQuery.js';

function SummaryIcon({name}){
  const paths={reviews:<><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 10h8M8 13h5"/></>,courses:<><path d="M4 5h7v15H4zM13 5h7v15h-7zM11 8c-2-1-4-1-7-1M13 8c2-1 4-1 7-1"/></>,reviewers:<><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1"/></>,likes:<><path d="M7 11v10H4V11h3ZM10 21h8a2 2 0 0 0 2-1.7l1-7a2 2 0 0 0-2-2.3h-5V6a3 3 0 0 0-3-3l-2 8-2 2v6l3 2Z"/></>};
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

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
  const summaryItems=[['review_count','รีวิวที่แสดง','reviews'],['reviewer_count','ผู้รีวิวไม่ซ้ำ','reviewers'],['total_likes','ยอดถูกใจรีวิว','likes'],['course_count','รายวิชา','courses']];
  return <section className="cc-dashboard ux-dashboard"><div className="ux-page-heading"><div><div className="dashboard-breadcrumb"><Link to="/">รายวิชา</Link><span aria-hidden="true">›</span><span>อันดับรายวิชา</span></div><h1>จัดอันดับรายวิชา</h1><p>เปรียบเทียบรายวิชาจากรีวิว ความสนใจ และคะแนนจากผู้เรียน</p></div></div>
    <CatalogFilters options={options} values={filters} onChange={change} advanced={false}/>
    <div className="dashboard-summary-grid">{summaryItems.map(([key,label,icon])=><div className="card dashboard-summary-card" key={key}><span className="dashboard-summary-icon"><SummaryIcon name={icon}/></span><div><span>{label}</span><strong>{summary.query!==query?'—':Number(summary.value[key]??0).toLocaleString('th-TH')}</strong></div></div>)}</div><p className="small muted dashboard-summary-note">ภาพรวมตามตัวกรองด้านบน · รีวิวขั้นต่ำใช้กับรายการจัดอันดับด้านล่างเท่านั้น</p>
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
