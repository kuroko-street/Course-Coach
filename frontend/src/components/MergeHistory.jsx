import {Link} from 'react-router-dom';
import {formatThaiDateTime} from '../lib/dateTime.js';

export default function MergeHistory({history}){
  return <article className="card admin-merge-history">
    <h2>ประวัติการรวมล่าสุด</h2>
    <p className="muted">การรวมรายวิชาสูงสุด 100 รายการล่าสุด</p>
    {history.length?<ul>{history.map(item=><li key={item.merge_id}>
      <div className="admin-merge-history-details">
        <strong>รวมรายวิชา</strong>
        <p className="muted">{item.actor || `แอดมิน #${item.admin_id}`} · {formatThaiDateTime(item.created_at)}</p>
        <p>ต้นทาง {item.source_course_ids.map(id=>`#${id}`).join(', ')} → วิชาหลัก #{item.primary_course_id}</p>
        <p className="admin-merge-history-reason">เหตุผล: {item.reason}</p>
      </div>
      <Link to={`/course/${item.primary_course_id}`}>วิชา #{item.primary_course_id}</Link>
    </li>)}</ul>:<div className="admin-merge-history-empty">ยังไม่มีประวัติการรวมรายวิชา</div>}
  </article>;
}
