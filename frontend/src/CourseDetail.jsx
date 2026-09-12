import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useLocation,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import {api} from './api.js';
import {useAuth} from './AuthContext.jsx';
import {RATING_FIELDS,RATING_LABELS,RATING_SHORT_LABELS} from './RatingStars.jsx';
import ReviewCard from './ReviewCard.jsx';
import SummaryFileCard from './components/SummaryFileCard.jsx';
import ReviewEditor from './components/ReviewEditor.jsx';
import UploadDialog from './components/UploadDialog.jsx';
import {loginPath,semesterLabel} from './components/CourseUI.jsx';
import {FileQuota,permissionDate,useContributionStatus} from './components/ContributionStatus.jsx';
import {catalogReturnPath} from './lib/catalogQuery.js';

export default function CourseDetail({listMode=null}){
  const {id}=useParams(),{user,authReady}=useAuth(),[params,setParams]=useSearchParams(),navigate=useNavigate(),location=useLocation();
  const [course,setCourse]=useState(null),[reviews,setReviews]=useState([]),[files,setFiles]=useState([]);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[dialog,setDialog]=useState(null),[retry,setRetry]=useState(0);
  const routeKey=`${id}:${user?.user_id||''}:${listMode||''}`,currentRoute=useRef(routeKey);currentRoute.current=routeKey;
  const {state:permissions,error:permissionError,refresh:refreshPermissions}=useContributionStatus(id,user?.user_id);
  const ownReview=reviews.find(r=>r.review_id===permissions?.review.active_review_id);
  const from=catalogReturnPath(location.state?.from),path=`/course/${id}`;
  const tab=listMode|| (params.get('tab')==='files'?'files':'reviews');
  const sort=['newest','likes','comments'].includes(params.get('sort'))?params.get('sort'):'newest';
  const load=useCallback(async(message='')=>{
    try{
      const [c,r,f]=await Promise.all([api(`/courses/${id}`),api(`/courses/${id}/reviews`),api(`/courses/${id}/summary-files`)]);
      if(currentRoute.current!==routeKey)return;
      if(c.redirected_from){navigate(`/course/${c.course_id}${listMode==='files'?'/summary-files':listMode==='reviews'?'/reviews':''}`,{replace:true,state:{from}});return;}
      setCourse(c);setReviews(r.reviews);setFiles(f.files);setError('');setNotice(message);await refreshPermissions();
    }catch(e){if(currentRoute.current===routeKey)setError('รายการอาจบันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ: '+e.message);}
  },[id,routeKey,listMode,from,navigate,refreshPermissions]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setCourse(null);setError('');setNotice('');setDialog(null);
    Promise.all([api(`/courses/${id}`,{signal:controller.signal}),api(`/courses/${id}/reviews`,{signal:controller.signal}),api(`/courses/${id}/summary-files`,{signal:controller.signal})]).then(([c,r,f])=>{
      if(controller.signal.aborted)return;
      if(c.redirected_from){navigate(`/course/${c.course_id}${listMode==='files'?'/summary-files':listMode==='reviews'?'/reviews':''}`,{replace:true,state:{from}});return;}
      setCourse(c);setReviews(r.reviews);setFiles(f.files);
    }).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[id,user?.user_id,listMode,retry]);
  useEffect(()=>{
    if(user&&course&&permissions&&params.get('review')==='1'){
      if(permissions.review.can_create||ownReview)setDialog('review');
      setParams(prev=>{const next=new URLSearchParams(prev);next.delete('review');return next;},{replace:true,state:location.state});
    }
  },[user,course,permissions,ownReview,params]);
  function selectTab(nextTab){setNotice('');setParams(prev=>{const next=new URLSearchParams(prev);if(nextTab==='files')next.set('tab','files');else next.delete('tab');return next;},{state:location.state});}
  const ordered=[...reviews].sort((a,b)=>sort==='likes'?(b.like_count-a.like_count||b.review_id-a.review_id):sort==='comments'?(b.comment_count-a.comment_count||b.review_id-a.review_id):b.review_id-a.review_id);
  const shownReviews=listMode?ordered:ordered.slice(0,3),shownFiles=listMode?files:files.slice(0,3);
  if(loading)return <p className="ux-loading" role="status">กำลังโหลดรายวิชา…</p>;
  if(!course)return <section><div className="card ux-empty"><h1>ยังเปิดรายวิชานี้ไม่ได้</h1><p role="alert">{error||'ไม่พบรายวิชา'}</p><div className="cc-actions"><button type="button" onClick={()=>setRetry(x=>x+1)}>ลองใหม่</button><Link className="btn btn-ghost" to={from}>กลับไปรายวิชา</Link></div></div></section>;
  const canReview=!!permissions&&(permissions.review.can_create||!!ownReview),canUpload=!!permissions&&permissions.files.available>0;
  const button=tab==='reviews'?
    !authReady?<button disabled>กำลังตรวจบัญชี…</button>:!user?<Link className="btn" to={loginPath(path+'?review=1')}>เข้าสู่ระบบเพื่อรีวิว</Link>:<button type="button" disabled={!canReview} onClick={()=>setDialog('review')}>{ownReview?'แก้ไขรีวิวของฉัน':permissions?.review.available_at?'พักสิทธิ์เขียนรีวิว':!permissions?'กำลังตรวจสิทธิ์…':'+ เขียนรีวิว'}</button>:
    !authReady?<button disabled>กำลังตรวจบัญชี…</button>:!user?<Link className="btn" to={loginPath(path+'?tab=files')}>เข้าสู่ระบบเพื่ออัปโหลด</Link>:<button type="button" disabled={!canUpload} onClick={()=>setDialog('upload')}>{!permissions?'กำลังตรวจสิทธิ์…':canUpload?'+ อัปโหลดไฟล์':'ยังไม่มีช่องอัปโหลดว่าง'}</button>;
  return <section><Link className="back-link" to={listMode?path:from} state={{from}}>← {listMode?'รายละเอียดวิชา':from.startsWith('/dashboard')?'กลับไปอันดับที่เลือกไว้':'กลับไปผลการค้นหา'}</Link>
    <div className={`ux-course-hero ${listMode?'ux-compact-hero':''}`}><div><span className="ux-card-code">{course.course_code}</span><h1>{course.course_name}</h1><p className="ux-course-subtitle">สจล. · {course.faculty_name} · {course.department}</p><div className="ux-course-meta"><span className="ux-term-pill">ปี {course.academic_year} · {semesterLabel(course.semester)}</span><span>{course.credits} หน่วยกิต</span></div><div className="ux-course-teachers"><span>ผู้สอน</span>{course.instructors.map(t=><Link key={t.instructor_id} to={`/instructor/${t.instructor_id}`}>{t.name}</Link>)}</div></div>
      <div className="ux-hero-score"><div><strong>{course.avg_satisfaction==null?'—':Number(course.avg_satisfaction).toFixed(2)}</strong>{course.avg_satisfaction!=null&&<small> / 5</small>}</div><div><p>{course.avg_satisfaction==null?'ยังไม่มีคะแนน':'ความพึงพอใจ'}</p><p>{course.review_count} รีวิวที่แสดง</p></div></div>
    </div>
    {!listMode&&<div className="ux-course-overview"><div className="card"><h2>คะแนนเฉลี่ยรายด้าน</h2><div className="ux-aspect-list">{RATING_FIELDS.filter(k=>k!=='satisfaction').map(k=><div className="ux-aspect-row" key={k}><span title={RATING_LABELS[k]}>{RATING_SHORT_LABELS[k]}</span><strong>{course[`avg_${k}`]==null?'—':`${Number(course[`avg_${k}`]).toFixed(2)} / 5`}</strong></div>)}</div><p className="ux-community-note">เฉลี่ยแต่ละด้านแยกกัน จากหนึ่งรีวิวที่แสดงต่อบัญชี</p></div>
      <div className="card"><h2>สิ่งที่ผู้รีวิวพูดถึง</h2>{course.tags.length?<div className="tag-chips">{course.tags.map(t=><span className="tag-chip tag-chip-static" key={t.tag_id}>#{t.tag_name} · {t.review_count} บัญชี</span>)}</div>:<p className="small muted">ยังไม่มีแท็กจากรีวิว</p>}<p className="ux-community-note">เป็นประสบการณ์ของผู้รีวิว ไม่ใช่ข้อมูลรับรองของวิชา</p>
        {course.syllabus||course.additional_details?<details className="ux-detail-disclosure"><summary>อ่านคำอธิบายและรายละเอียดวิชา</summary>{course.syllabus&&<p className="cc-secondary-content">{course.syllabus}</p>}{course.additional_details&&<p className="cc-secondary-content">{course.additional_details}</p>}</details>:<p className="ux-community-note">ผู้สร้างยังไม่ได้เพิ่มคำอธิบายวิชา</p>}
      </div></div>}
    <div className="ux-content-nav"><div className="ux-tabs" aria-label="เนื้อหาในรายวิชา">{listMode?<><Link className={tab==='reviews'?'is-active':''} to={path+'/reviews'} state={{from}}>รีวิว <span>{reviews.length}</span></Link><Link className={tab==='files'?'is-active':''} to={path+'/summary-files'} state={{from}}>ไฟล์เรียน <span>{files.length}</span></Link></>:<><button type="button" aria-pressed={tab==='reviews'} onClick={()=>selectTab('reviews')}>รีวิว <span>{reviews.length}</span></button><button type="button" aria-pressed={tab==='files'} onClick={()=>selectTab('files')}>ไฟล์เรียน <span>{files.length}</span></button></>}</div><div className="ux-content-action">{user&&tab==='files'&&permissions&&<p>อัปได้อีก {permissions.files.available} ไฟล์</p>}{button}</div></div>
    {notice&&<p role="status" className="alert alert-success">{notice}</p>}
    {(error||permissionError)&&<div role="alert" className="alert alert-error ux-inline-error"><span>{error||`ตรวจสิทธิ์ไม่สำเร็จ: ${permissionError}`}</span><button className="btn-ghost" type="button" onClick={()=>load()}>โหลดข้อมูลใหม่</button></div>}
    {user&&tab==='reviews'&&permissions?.review.available_at&&<div className="ux-quota-alert"><strong>พักสิทธิ์เขียนรีวิวในรายการนี้</strong><p>รีวิวถูกซ่อนหลังได้รับรายงานครบ 5 บัญชี เขียนใหม่ได้วันที่ {permissionDate(permissions.review.available_at)} การลบรีวิวระหว่างพักไม่ทำให้คืนสิทธิ์เร็วขึ้น</p></div>}
    {user&&tab==='files'&&<FileQuota quota={permissions?.files} compact/>}
    <div className="ux-content-toolbar"><p>{listMode?(tab==='reviews'?'รีวิวทั้งหมดในรายการนี้':'ไฟล์ทั้งหมดในรายการนี้'):(tab==='reviews'?`แสดง ${shownReviews.length} จาก ${reviews.length} รีวิว`:`แสดง ${shownFiles.length} จาก ${files.length} ไฟล์`)}</p>{tab==='reviews'&&reviews.length>1&&<label className="ux-sort">เรียงรีวิว<select value={sort} onChange={e=>setParams(prev=>{const next=new URLSearchParams(prev);next.set('sort',e.target.value);return next;},{state:location.state})}><option value="newest">ใหม่ที่สุด</option><option value="likes">ถูกใจมากที่สุด</option><option value="comments">ความคิดเห็นมากที่สุด</option></select></label>}</div>
    {tab==='reviews'?(shownReviews.length?shownReviews.map(r=><ReviewCard key={r.review_id} review={r} course={course} onChanged={load}/>):<div className="card ux-empty"><h3>ยังไม่มีรีวิวที่แสดงในรายการนี้</h3><p>แบ่งปันประสบการณ์เพื่อช่วยคนที่กำลังตัดสินใจเลือกเรียน</p></div>):(shownFiles.length?shownFiles.map(f=><SummaryFileCard key={f.file_id} file={f} onChanged={load}/>):<div className="card ux-empty"><h3>ยังไม่มีไฟล์เรียนในรายการนี้</h3><p>แบ่งปันสรุปหรือเอกสารที่คุณมีสิทธิ์เผยแพร่ ผ่านปุ่มอัปโหลดด้านบน</p></div>)}
    {!listMode&&(tab==='reviews'?reviews.length:files.length)>0&&<div className="ux-more-link"><Link className="btn btn-ghost" to={path+(tab==='files'?'/summary-files':'/reviews')} state={{from}}>{tab==='files'?`ดูไฟล์ทั้งหมด (${files.length})`:`ดูรีวิวทั้งหมด (${reviews.length})`} →</Link></div>}
    <p className="ux-page-note">ข้อมูลจากผู้ใช้ · ปี เทอม และผู้สอนเป็นบริบทของรายการนี้ ไม่รับรองการเปิดสอนหรือประวัติการเรียน</p>
    {dialog==='review'&&<ReviewEditor courseId={id} course={course} review={ownReview} onClose={()=>setDialog(null)} onSaved={()=>load('บันทึกรีวิวแล้ว คะแนนและแท็กอัปเดตตามรีวิวล่าสุด')}/>}
    {dialog==='upload'&&<UploadDialog courseId={id} course={course} quota={permissions?.files} onClose={()=>setDialog(null)} onSaved={()=>load()}/>}
  </section>;
}
