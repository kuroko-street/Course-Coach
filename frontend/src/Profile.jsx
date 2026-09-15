import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, apiUpload } from "./api.js";
import { useAuth } from "./AuthContext.jsx";
import Avatar from "./Avatar.jsx";

export default function Profile() {
  const { id } = useParams();
  const { user, updateUser } = useAuth();
  const [data, setData] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const own = user?.user_id === Number(id);
  useEffect(() => {
    let cancelled = false;
    setData(null); setError(""); setMessage("");
    api(`/users/${id}/profile`).then(result => {
      if (!cancelled) { setData(result); setName(result.user.display_name); }
    }).catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [id]);
  async function update(operation) {
    setPending(true); setError(""); setMessage("");
    try {
      const result = await operation();
      updateUser(result.user);
      setData(prev => ({ ...prev, user: { ...prev.user, display_name: result.user.display_name, avatar_url: result.user.avatar_url } }));
      setMessage("บันทึกแล้ว ชื่อนี้จะใช้กับรีวิว ไฟล์ และคอมเมนต์เดิมของคุณด้วย");
    } catch (err) { setError(err.message); }
    finally { setPending(false); }
  }
  return <section className="profile-page">
    <Link to="/" className="back-link">← รายวิชา</Link>
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    {!data ? !error && <p>กำลังโหลดโปรไฟล์…</p> : <>
      <div className="profile-header"><Avatar url={data.user.avatar_url} size={64} /><div><h1>{data.user.display_name}</h1><p className="muted">โปรไฟล์และผลงานที่แบ่งปันใน Course Coach</p></div></div>
      {own && <div className="card profile-settings"><h2>แก้ไขโปรไฟล์</h2><p className="muted">ชื่อและรูปนี้จะแสดงคู่กับผลงานของคุณ</p>
        <form className="profile-name-form" onSubmit={e => { e.preventDefault(); if (name.trim()) update(() => api("/users/me", { method: "PUT", body: { display_name: name.trim() } })); }}>
          <label htmlFor="display-name">ชื่อที่แสดงต่อสาธารณะ</label>
          <input aria-describedby="name-help" id="display-name" value={name} maxLength={100} required onChange={e => setName(e.target.value)} />
          <p id="name-help" className="muted small">ใช้ชื่อที่ต้องการให้ผู้ใช้คนอื่นเห็น สูงสุด 100 ตัวอักษร</p><button className="btn-primary" disabled={pending || !name.trim()}>{pending ? "กำลังบันทึก…" : "บันทึกชื่อ"}</button>
        </form>
        <label className="profile-avatar-field">รูปโปรไฟล์<span className="muted small">เลือกไฟล์ภาพ PNG, JPEG หรือ WebP</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={pending} onChange={e => { const file = e.target.files?.[0]; if (file) update(() => apiUpload("/users/me/avatar", { file })); e.target.value = ""; }} /></label>
        {message && <p className="alert alert-success" role="status">{message}</p>}
      </div>}
      <div className="profile-stats"><div><strong>{data.review_count}</strong><span>รีวิวที่แสดง</span></div><div><strong>{data.total_likes}</strong><span>ถูกใจที่ได้รับ</span></div></div>
      <h2>ประวัติการรีวิว</h2>
      {!data.reviews.length && <div className="profile-empty"><h3>ยังไม่มีรีวิวที่แสดง</h3><p className="muted">รีวิวที่เผยแพร่จะแสดงที่นี่</p><Link to="/" className="btn btn-ghost">ค้นหารายวิชา</Link></div>}
      {data.reviews.map(r => <Link className="card review-card profile-review-link" to={`/course/${r.course_id}`} key={r.review_id}>
        <strong>{r.course_code} · {r.course_name}</strong>
        <div className="meta">ปี {r.academic_year} · {r.semester === "summer" ? "ภาคฤดูร้อน" : `เทอม ${r.semester}`} · พึงพอใจ {r.rating_satisfaction}/5</div>
        <p className="review-content">{r.content}</p><span>♡ {r.like_count}</span>
      </Link>)}
    </>}
  </section>;
}
