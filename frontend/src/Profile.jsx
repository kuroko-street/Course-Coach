import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, apiUpload } from "./api.js";
import { useAuth } from "./AuthContext.jsx";

function ProfilePortrait({ name, url, large = false }) {
  const initial = name?.trim().charAt(0).toLocaleUpperCase("th-TH") || "?";
  return <span className={`profile-portrait${large ? " profile-portrait-large" : ""}`}>
    {url ? <img src={url} alt="" /> : <span aria-hidden="true">{initial}</span>}
  </span>;
}

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

  async function update(operation, successText, syncName = false) {
    setPending(true); setError(""); setMessage("");
    try {
      const result = await operation();
      updateUser(result.user);
      setData(prev => prev && ({
        ...prev,
        user: { ...prev.user, display_name: result.user.display_name, avatar_url: result.user.avatar_url },
      }));
      if (syncName) setName(result.user.display_name);
      setMessage(successText);
    } catch (err) { setError(err.message); }
    finally { setPending(false); }
  }

  return <section className="profile-page">
    <Link to="/" className="back-link">← รายวิชา</Link>
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    {!data ? !error && <p>กำลังโหลดโปรไฟล์…</p> : <>
      <header className="profile-hero card">
        <div className="profile-hero-person">
          <ProfilePortrait name={data.user.display_name} url={data.user.avatar_url} />
          <div className="profile-hero-copy">
            <h1>{data.user.display_name}</h1>
            <p>โปรไฟล์และผลงานที่แบ่งปันใน Course Coach</p>
          </div>
        </div>
        <div className="profile-hero-stats" aria-label="สถิติโปรไฟล์">
          <div><strong>{data.review_count}</strong><span>รีวิวที่แสดง</span></div>
          <div><strong>{data.total_likes}</strong><span>ถูกใจที่ได้รับ</span></div>
        </div>
      </header>

      {own && <div className="profile-edit-grid">
        <div className="card profile-edit-card">
          <h2>แก้ไขโปรไฟล์</h2>
          <p className="profile-card-intro">ชื่อนี้จะแสดงคู่กับรีวิวและไฟล์ของคุณ</p>
          <form className="profile-name-form" onSubmit={e => {
            e.preventDefault();
            if (name.trim()) update(
              () => api("/users/me", { method: "PUT", body: { display_name: name.trim() } }),
              "บันทึกชื่อแล้ว ชื่อใหม่จะแสดงกับผลงานเดิมของคุณด้วย",
              true
            );
          }}>
            <label htmlFor="display-name">ชื่อที่แสดงต่อสาธารณะ</label>
            <input id="display-name" value={name} maxLength={100} required
              onChange={e => setName(e.target.value)} />
            <button className="btn-primary" disabled={pending || !name.trim()}>
              {pending ? "กำลังบันทึก…" : "บันทึกชื่อ"}
            </button>
          </form>
        </div>
        <div className="card profile-edit-card profile-photo-card">
          <h2>รูปโปรไฟล์</h2>
          <div className="profile-photo-preview">
            <ProfilePortrait name={data.user.display_name} url={data.user.avatar_url} large />
          </div>
          <label className={`profile-upload-button${pending ? " is-disabled" : ""}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m4 18 5-5 3 3 3-4 5 6" />
            </svg>
            <span>เลือกรูปใหม่</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={pending}
              aria-label="เลือกรูปโปรไฟล์ใหม่"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) update(
                  () => apiUpload("/users/me/avatar", { file }),
                  "อัปเดตรูปโปรไฟล์แล้ว"
                );
                e.target.value = "";
              }} />
          </label>
          <p className="profile-photo-hint">PNG, JPEG หรือ WebP</p>
        </div>
        {message && <p className="alert alert-success profile-save-message" role="status">{message}</p>}
      </div>}

      <section className="card profile-history" aria-labelledby="profile-history-title">
        <h2 id="profile-history-title">ประวัติการรีวิว</h2>
        {!data.reviews.length ? <div className="profile-empty">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M11 5h21l5 5v31l-5-3-5 3-5-3-5 3-6-3V5Z" />
            <path d="M17 17h14M17 23h14M17 29h10" />
          </svg>
          <h3>ยังไม่มีรีวิวที่แสดง</h3>
          <p>{own ? "เมื่อคุณเขียนรีวิวรายวิชา รีวิวจะมาแสดงที่นี่" : "ผู้ใช้นี้ยังไม่มีรีวิวที่แสดง"}</p>
          <Link to="/" className="btn">ค้นหารายวิชา</Link>
        </div> : <div className="profile-review-list">
          {data.reviews.map(r => <Link className="profile-review-link" to={`/course/${r.course_id}`} key={r.review_id}>
            <div className="profile-review-top"><strong>{r.course_code} · {r.course_name}</strong><span>♡ {r.like_count}</span></div>
            <div className="meta">ปี {r.academic_year} · {r.semester === "summer" ? "ภาคฤดูร้อน" : `เทอม ${r.semester}`} · พึงพอใจ {r.rating_satisfaction}/5</div>
            <p className="review-content">{r.content}</p>
          </Link>)}
        </div>}
      </section>
    </>}
  </section>;
}
