import {useId,useRef,useState} from 'react';
import {api} from '../api.js';
import {RatingForm,RATING_FIELDS,defaultRatings,ratingsFromReview} from '../RatingStars.jsx';
import {Modal,TagPicker,courseSubtitle,useCatalogOptions} from './CourseUI.jsx';

export default function ReviewEditor({courseId,course,review,onClose,onSaved}){
  const {options,error:optionsError}=useCatalogOptions(),formId=useId(),formRef=useRef(null),original=useRef(review).current;
  const [content,setContent]=useState(original?.content||''),[ratings,setRatings]=useState(original?ratingsFromReview(original):defaultRatings(null)),[tags,setTags]=useState((original?.tags||[]).map(t=>t.tag_id));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[missing,setMissing]=useState([]),[saved,setSaved]=useState(false);
  const snapshot=(text,scores,ids)=>JSON.stringify([text,scores,[...ids].sort((a,b)=>a-b)]);
  const baseline=useRef(snapshot(content,ratings,tags)).current;
  const dirty=!saved&&snapshot(content,ratings,tags)!==baseline;
  const answered=RATING_FIELDS.filter(k=>ratings[k]>=1&&ratings[k]<=5).length;
  async function submit(event){
    event.preventDefault();setError('');if(busy||saved)return;
    const absent=RATING_FIELDS.filter(k=>!(ratings[k]>=1&&ratings[k]<=5));setMissing(absent);
    if(absent.length){setError('ยังเลือกคะแนนไม่ครบ กรุณาตอบด้านที่ทำเครื่องหมายไว้');requestAnimationFrame(()=>{const field=formRef.current?.querySelector(`[data-rating-field="${absent[0]}"]`);field?.querySelector('input')?.focus({preventScroll:true});field?.scrollIntoView({block:'center',behavior:'auto'});});return;}
    setBusy(true);
    try{
      const body={content:content.trim(),tag_ids:tags,...Object.fromEntries(RATING_FIELDS.map(k=>[`rating_${k}`,ratings[k]]))};if(!original)body.course_id=Number(courseId);
      await api(original?`/reviews/${original.review_id}`:'/reviews',{method:original?'PUT':'POST',body});setSaved(true);
      try{await onSaved?.();onClose();}catch(e){setError('บันทึกรีวิวแล้ว แต่โหลดหน้าจอล่าสุดไม่สำเร็จ กรุณาปิดหน้าต่างแล้วโหลดหน้าใหม่');}
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <Modal title={original?'แก้ไขรีวิว':'เขียนรีวิว'} subtitle={courseSubtitle(course)||`รายการวิชา #${courseId}`} onClose={onClose} busy={busy} dirty={dirty} footer={<><span className="ux-footer-hint">เลือกคะแนนแล้ว {answered} / 6 ด้าน</span><button type="button" className="btn-ghost" disabled={busy} onClick={()=>formRef.current?.closest('[role="dialog"]')?.querySelector('.modal-close')?.click()}>ยกเลิก</button>{saved?<button type="button" onClick={onClose}>ปิดหน้าต่าง</button>:<button type="submit" form={formId} disabled={busy||!content.trim()}>{busy?'กำลังบันทึก…':original?'บันทึกการแก้ไข':'ส่งรีวิว'}</button>}</>}>
    <form id={formId} ref={formRef} className="ux-review-form" onSubmit={submit}><fieldset disabled={busy||saved} style={{border:0,padding:0,margin:0,minWidth:0}}>
      <label>ประสบการณ์ของคุณ <span className="muted">(จำเป็น)</span><textarea required rows={3} maxLength={10000} value={content} onChange={e=>setContent(e.target.value)} placeholder="เล่าถึงสิ่งที่ได้เรียน การสอน หรืองานในวิชานี้…"/></label>
      <p className="ux-form-hint">หนึ่งรีวิวต่อบัญชีต่อรายการวิชา กลับมาแก้ไขคะแนน ข้อความ และแท็กได้</p>
      <RatingForm ratings={ratings} missing={missing} onChange={next=>{setRatings(next);setMissing(prev=>prev.filter(k=>!(next[k]>=1&&next[k]<=5)));}}/>
      <h3>แท็กประสบการณ์ <span className="muted small">ไม่บังคับ</span></h3><p className="ux-form-hint">เลือกข้อที่ตรงกับประสบการณ์ของคุณได้หลายข้อ</p><TagPicker tags={options?.tags||[]} selected={tags} onChange={setTags}/>
    </fieldset>{(error||optionsError)&&<p role="alert" className="alert alert-error">{error||optionsError}</p>}{!content.trim()&&<p className="ux-form-hint">กรอกประสบการณ์และเลือกคะแนนทั้ง 6 ด้านก่อนส่งรีวิว</p>}</form>
  </Modal>;
}
