import {useCallback,useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import {api} from './api.js';
import {useToast} from './components/ToastProvider.jsx';
import {isCourseUnavailable} from './lib/courseAvailability.js';

export default function useCourseUnavailableRedirect() {
  const navigate=useNavigate(),toast=useToast(),notified=useRef(false);
  const redirect=useCallback(()=>{
    if(notified.current)return;
    notified.current=true;
    toast.error('ไม่พบรายวิชานี้แล้ว','รายวิชานี้อาจถูกรวมหรือปิดแสดง กลับไปเลือกวิชาจากหน้าแรก');
    navigate('/',{replace:true});
  },[navigate,toast]);
  const check=useCallback(async(courseId,error,isCurrent=()=>true)=>{
    if(notified.current)return true;
    if(!isCurrent())return false;
    const unavailable=await isCourseUnavailable(courseId,error,id=>api(`/courses/${id}`));
    if(unavailable&&isCurrent()){redirect();return true;}
    return false;
  },[redirect]);
  return {redirect,check};
}
