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
  return <section>
    <Link to="/" className="back-link">← รายวิชา</Link>
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    {!data ? !error && <p>กำลังโหลดโปรไฟล์…</p> : <>
      <div className="profile-header"><Avatar url={data.user.avatar_url} size={64} /><h1>{data.user.display_name}</h1></div>
      {own && <div className="card">
        <form onSubmit={e => { e.preventDefault(); if (name.trim()) update(() => api("/users/me", { method: "PUT", body: { display_name: name.trim() } })); }}>
          <label htmlFor="display-name">ชื่อที่แสดงต่อสาธารณะ</label>
          <input id="display-name" value={name} maxLength={100} required onChange={e => setName(e.target.value)} />
          <button disabled={pending || !name.trim()}>บันทึกชื่อ</button>
        </form>
        <label>เปลี่ยนรูปโปรไฟล์ <input type="file" accept="image/png,image/jpeg,image/webp" disabled={pending} onChange={e => { const file = e.target.files?.[0]; if (file) update(() => apiUpload("/users/me/avatar", { file })); e.target.value = ""; }} /></label>
        {message && <p className="alert alert-success" role="status">{message}</p>}
      </div>}
      <p>{data.review_count} รีวิวที่แสดง · {data.total_likes} ถูกใจ</p>
      <h2>ประวัติการรีวิว</h2>
      {!data.reviews.length && <p className="muted">ยังไม่มีรีวิวที่แสดง</p>}
      {data.reviews.map(r => <Link className="card review-card profile-review-link" to={`/course/${r.course_id}`} key={r.review_id}>
        <strong>{r.course_code} · {r.course_name}</strong>
        <div className="meta">ปี {r.academic_year} · {r.semester === "summer" ? "ภาคฤดูร้อน" : `เทอม ${r.semester}`} · พึงพอใจ {r.rating_satisfaction}/5</div>
        <p className="review-content">{r.content}</p><span>♡ {r.like_count}</span>
      </Link>)}
    </>}
  </section>;
}
