import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../api.js';

export const permissionDate = value => new Date(value).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'});
export function useContributionStatus(courseId,userId){
  const [state,setState]=useState(null),[error,setError]=useState('');
  const key=`${courseId}:${userId||''}`,scope=useRef(key),mounted=useRef(true);scope.current=key;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const refresh=useCallback(async()=>{
    if(!userId){setState(null);return null;}
    const result=await api(`/courses/${courseId}/contribution-status`);
    if(mounted.current&&scope.current===key){setState(result);setError('');}return result;
  },[courseId,userId]);
  useEffect(()=>{
    setState(null);setError('');if(!userId)return;
    let active=true;const controller=new AbortController();
    const update=()=>api(`/courses/${courseId}/contribution-status`,{signal:controller.signal}).then(r=>{if(active){setState(r);setError('');}}).catch(e=>{if(active&&e.name!=='AbortError')setError(e.message);});
    update();const timer=setInterval(update,60000);
    window.addEventListener('focus',update);
    return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('focus',update);};
  },[courseId,userId]);
  // Recheck at the server's deadline, independently of the computer's wall clock.
  useEffect(()=>{
    if(!state)return;
    const dates=[state.review.available_at,...state.files.holds.map(h=>h.expires_at)].filter(Boolean);
    if(!dates.length)return;
    const delay=Math.min(...dates.map(d=>new Date(d)-new Date(state.server_now)));
    const timer=setTimeout(()=>refresh().catch(e=>{if(mounted.current&&scope.current===key)setError(e.message);}),Math.min(2147483000,Math.max(500,delay+250)));
    return()=>clearTimeout(timer);
  },[state,refresh]);
  return {state,error,refresh};
}
export function FileQuota({quota,compact=false}){
  if(!quota)return <p className="muted">กำลังตรวจสิทธิ์ไฟล์…</p>;
  return <div className="ux-quota-status">{!compact&&<div className="ux-quota-summary"><strong>อัปโหลดได้อีก {quota.available} ไฟล์</strong><p>ใช้อยู่ {quota.used} / 3 ช่อง{quota.held>0?` · พัก ${quota.held} ช่อง`:''}</p></div>}
    {quota.over_limit>0&&<p className="ux-quota-alert">มีไฟล์หรือช่องพักเดิมเกินโควต้า เก็บไฟล์ไว้ครบ แต่อัปเพิ่มไม่ได้จนมีช่องว่าง</p>}
    {quota.holds.map(h=><p className="ux-quota-alert" key={h.file_id}>ไฟล์ #{h.file_id} ถูกซ่อน · คืนช่องวันที่ {permissionDate(h.expires_at)} ลบระหว่างพักไม่คืนก่อนกำหนด</p>)}
    {compact&&quota.available===0&&quota.held===0&&<p>ใช้ครบ 3 ช่องแล้ว ลบไฟล์ปกติของคุณเพื่อคืนช่องก่อนอัปโหลดใหม่</p>}
    <details><summary>กติกาการอัปโหลด · 3 ไฟล์ต่อบัญชีต่อรายการวิชา</summary><p>หนึ่งไฟล์ใช้หนึ่งช่อง ลบไฟล์ปกติคืนช่องทันที ไฟล์ที่ถูกรายงานครบ 5 บัญชีพักช่อง 7 วัน ลบระหว่างพักก็ไม่คืนก่อนกำหนด</p></details>
  </div>;
}
