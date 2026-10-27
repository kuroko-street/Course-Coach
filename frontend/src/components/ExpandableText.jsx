import {useState} from 'react';

export default function ExpandableText({text='',limit=300,className=''}){
  const [expanded,setExpanded]=useState(false);
  const content=String(text??'');
  const characters=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter('th',{granularity:'grapheme'}).segment(content),item=>item.segment):Array.from(content);
  const long=characters.length>limit||content.split('\n').length>4;
  return <div className={`expandable-text${expanded?' is-expanded':long?' is-truncated':''}`}><p className={className}>{long&&!expanded?characters.slice(0,limit).join('').trimEnd()+'…':content}</p>{long&&<button type="button" className="expandable-text-toggle" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'แสดงน้อยลง':'อ่านเพิ่มเติม'}</button>}</div>;
}
