import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from './api.js';

const CACHE_MS=30000;
// Keep pages while this course view is open. No cached user data crosses accounts.
export default function useCourseContent({courseId,userId,authReady,tab,listMode,page,sort,onCourseError}){
  const scope=`${courseId}:${userId||''}`,size=listMode?20:3;
  const key=`${scope}:${tab}:${size}:${page}:${tab==='reviews'?sort:'newest'}`;
  const cache=useRef(new Map()),cacheScope=useRef(scope),currentKey=useRef(key),request=useRef(null);
  currentKey.current=key;
  if(cacheScope.current!==scope){cache.current.clear();cacheScope.current=scope;}
  const [entry,setEntry]=useState(null),[summary,setSummary]=useState(null),[own,setOwn]=useState(null);
  const apply=useCallback(data=>{
    setEntry({key,data,error:'',loading:false});
    setSummary(previous=>({...(previous?.scope===scope?previous:{scope}),[tab]:data.total}));
    if(tab==='reviews')setOwn({scope,review:data.own_review});
  },[key,scope,tab]);
  const load=useCallback(async(force=false)=>{
    if(!authReady||currentKey.current!==key)return false;
    const cached=cache.current.get(key);
    if(!force&&cached&&cached.expiresAt>Date.now()){apply(cached.data);return true;}
    request.current?.abort();
    const controller=new AbortController();request.current=controller;
    setEntry({key,data:null,error:'',loading:true});
    try{
      const query=new URLSearchParams({page,page_size:size});
      if(tab==='reviews')query.set('sort',sort);
      const data=await api(`/courses/${courseId}/${tab==='files'?'summary-files':'reviews'}?${query}`,{signal:controller.signal});
      if(controller.signal.aborted||currentKey.current!==key)return false;
      cache.current.set(key,{data,expiresAt:Date.now()+CACHE_MS});
      if(cache.current.size>20)cache.current.delete(cache.current.keys().next().value);
      apply(data);return true;
    }catch(error){
      if(controller.signal.aborted||currentKey.current!==key||error.name==='AbortError')return false;
      if(await onCourseError?.(error))return false;
      if(!controller.signal.aborted&&currentKey.current===key)setEntry({key,data:null,error:error.message,loading:false});
      return null;
    }
  },[authReady,key,apply,page,size,sort,tab,courseId,onCourseError]);
  useEffect(()=>{load();return()=>request.current?.abort();},[load]);
  const refresh=useCallback(()=>{
    if(currentKey.current!==key)return Promise.resolve(false);
    cache.current.clear();return load(true);
  },[key,load]);
  const updateLike=useCallback((kind,id,liked,count)=>{
    const field=kind==='reviews'?'review_id':'file_id';
    const updateRow=row=>row?.[field]===id?{...row,liked_by_me:liked,like_count:count}:row;
    const update=data=>data?{...data,...(data[kind]?{[kind]:data[kind].map(updateRow)}:{}),...(kind==='reviews'?{own_review:updateRow(data.own_review)}:{})}:data;
    for(const [cacheKey,cached] of cache.current)cache.current.set(cacheKey,{...cached,data:update(cached.data)});
    setEntry(previous=>previous?.key.startsWith(`${scope}:`)?{...previous,data:update(previous.data)}:previous);
    if(kind==='reviews')setOwn(previous=>previous?.scope===scope?{...previous,review:updateRow(previous.review)}:previous);
  },[scope]);
  const current=entry?.key===key?entry:null;
  return {
    reviews:current?.data?.reviews||[],files:current?.data?.files||[],
    total:current?.data?.total??null,reviewTotal:summary?.scope===scope?summary.reviews:null,
    fileTotal:summary?.scope===scope?summary.files:null,ownReview:own?.scope===scope?own.review:null,
    loading:!authReady||!current||current.loading,error:current?.error||'',refresh,updateLike,
  };
}
