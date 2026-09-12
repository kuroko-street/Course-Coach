import {useEffect,useRef} from 'react';

// Native disclosure + normal links/buttons: keyboard users can Tab through it.
export default function ActionMenu({label='ตัวเลือกเพิ่มเติม',trigger,children,className=''}) {
  const ref=useRef(null);
  useEffect(()=>{
    function outside(event){if(!ref.current?.contains(event.target))ref.current?.removeAttribute('open');}
    function escape(event){if(event.key==='Escape'&&ref.current?.open){ref.current.removeAttribute('open');ref.current.querySelector('summary')?.focus();}}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[]);
  return <details ref={ref} className={`ux-menu ${className}`}><summary aria-label={label}>{trigger || <span aria-hidden="true">•••</span>}</summary>
    <div className="ux-menu-panel" onClick={event=>{if(event.target.closest('a,button')){ref.current?.removeAttribute('open');ref.current?.querySelector('summary')?.focus();}}}>{children}</div>
  </details>;
}
