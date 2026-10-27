// PostgreSQL TIMESTAMP values in this app represent UTC but have no offset in JSON.
// TIMESTAMPTZ values already include one; preserve it when present.
export function parseServerDateTime(value){
  const text=String(value).replace(' ','T');
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)?text:`${text}Z`);
}

export function formatThaiDateTime(value,options={}){
  const date=parseServerDateTime(value);
  return Number.isNaN(date.getTime())?'—':date.toLocaleString('th-TH',{...options,timeZone:'Asia/Bangkok'});
}
