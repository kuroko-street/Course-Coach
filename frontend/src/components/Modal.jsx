import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

export function Modal({title,subtitle,onClose,busy=false,dirty=false,footer,children}) {
  const titleId=useId(),dialog=useRef(null),current=useRef({});
  const [discard,setDiscard]=useState(false);
  current.current={onClose,busy,dirty,discard};
  function requestClose(){if(current.current.busy)return;if(current.current.dirty)setDiscard(true);else current.current.onClose();}
  useEffect(()=>{
    const previous=document.activeElement,root=document.getElementById('root');
    const oldInert=root?.inert,oldOverflow=document.body.style.overflow;
    if(root)root.inert=true;document.body.style.overflow='hidden';
    dialog.current?.querySelector('button')?.focus();
    function keydown(event){
      if(event.key==='Escape'){
        // Let a native select close its own picker first, without closing the form.
        if(event.defaultPrevented)return;
        try{if(dialog.current?.querySelector('select:open'))return;}catch{/* Older browsers have no :open selector. */}
        event.preventDefault();if(current.current.discard)setDiscard(false);else requestClose();
      }
      if(event.key==='Tab'){
        const nodes=Array.from(dialog.current?.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],summary') || []).filter(el=>el.getClientRects().length);
        if(!nodes.length){event.preventDefault();return;}
        const first=nodes[0],last=nodes[nodes.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    }
    document.addEventListener('keydown',keydown);
    return()=>{if(root)root.inert=oldInert;document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',keydown);previous?.focus?.();};
  },[]);
  useEffect(()=>{dialog.current?.querySelector(discard?'[data-keep-editing]':'.modal-close')?.focus();},[discard]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=event=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  return createPortal(<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)requestClose();}}>
    <div ref={dialog} className="modal-card ux-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="ux-modal-header"><div><h2 id={titleId}>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button type="button" className="modal-close" aria-label="ปิดหน้าต่าง" disabled={busy} onClick={requestClose}>×</button></header>
      {discard&&<div className="ux-discard" role="alertdialog" aria-label="ยืนยันการปิดโดยไม่บันทึก"><h3>ยังมีข้อมูลที่ไม่ได้บันทึก</h3><p>ถ้าปิดตอนนี้ ข้อความที่แก้หรือคิวไฟล์ที่ยังไม่สำเร็จจะไม่ถูกเก็บไว้</p><div className="cc-actions"><button type="button" data-keep-editing onClick={()=>setDiscard(false)}>กลับไปทำต่อ</button><button type="button" className="btn-danger-outline" onClick={onClose}>ทิ้งข้อมูลและปิด</button></div></div>}
      <div className="ux-modal-content" hidden={discard}>{children}</div>
      {footer&&<footer className="ux-modal-footer" hidden={discard}>{footer}</footer>}
    </div>
  </div>,document.body);
}
export function ConfirmDialog({title,children,confirmLabel='ยืนยัน',onConfirm,onClose,busy,error}) {
  return <Modal title={title} onClose={onClose} busy={busy} footer={<><button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>ยกเลิก</button><button type="button" disabled={busy} onClick={onConfirm}>{busy?'กำลังดำเนินการ…':confirmLabel}</button></>}><p>{children}</p>{error&&<p role="alert" className="alert alert-error">{error}</p>}</Modal>;
}
