import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, apiUpload } from "./api.js";
import { useAuth } from "./AuthContext.jsx";
import Avatar from "./Avatar.jsx";

/**
 * /profile/:id — FR-11/FR-15/FR-16: reviewer profile page.
 *
 * Shows the author's avatar/name/credit, total likes received, and their
 * full review history (each linking back to the course).
 *
 * When you're looking at your OWN profile, an extra section lists every
 * course you have the right to review (i.e. every enrollment on record),
 * flagging which ones you've already reviewed. That list is self-only data
 * (`GET /api/users/:id/enrollments` 403s for anyone else), so it's simply
 * not requested when viewing someone else's profile.
 */
export default function Profile() {
  const { id } = useParams();
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [enrollments, setEnrollments] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [renamingName, setRenamingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);

  const isOwnProfile = user?.user_id === Number(id);

  async function handleRenameSubmit(e) {
    e.preventDefault();
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    setError("");
    try {
      const data = await api("/users/me", { method: "PUT", body: { display_name: trimmed } });
      setProfile((prev) => ({ ...prev, user: { ...prev.user, display_name: data.user.display_name } }));
      updateUser({ display_name: data.user.display_name });
      setRenamingName(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setError("");
    try {
      const data = await apiUpload("/users/me/avatar", { file });
      setProfile((prev) => ({ ...prev, user: { ...prev.user, avatar_url: data.user.avatar_url } }));
      updateUser({ avatar_url: data.user.avatar_url });
    } catch (err) {
      setError(err.message);
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  }

  useEffect(() => {
    setLoading(true);
    setError("");
    setEnrollments(null);

    const requests = [api(`/users/${id}/profile`)];
    if (isOwnProfile) {
      requests.push(api(`/users/${id}/enrollments`, { userId: user.user_id }));
    }

    Promise.all(requests)
      .then(([profileData, enrollmentData]) => {
        setProfile(profileData);
        if (enrollmentData) setEnrollments(enrollmentData.enrollments || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isOwnProfile]);

  if (loading) return <p className="muted">Loading…</p>;

  if (error || !profile) {
    return (
      <section>
        {error && <div className="alert alert-error">{error}</div>}
        <Link to="/" className="back-link">
          ← Back to catalog
        </Link>
      </section>
    );
  }

  const { user: profileUser, total_likes, review_count, reviews } = profile;

  return (
    <>
      <Link to="/" className="back-link">
        ← Back to catalog
      </Link>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="profile-header">
        <div style={{ position: "relative" }}>
          <Avatar url={profileUser.avatar_url} size={64} />
          {isOwnProfile && (
            <label
              title="เปลี่ยนรูปโปรไฟล์"
              style={{
                position: "absolute", bottom: -4, right: -4, cursor: "pointer",
                background: "var(--brand)", color: "#fff", borderRadius: "50%",
                width: 22, height: 22, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 12,
              }}
            >
              {avatarUploading ? "…" : "✎"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarChange}
                disabled={avatarUploading}
                hidden
              />
            </label>
          )}
        </div>
        <div>
          {renamingName ? (
            <form onSubmit={handleRenameSubmit} style={{ display: "flex", gap: 8 }}>
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={100}
                autoFocus
              />
              <button type="submit">บันทึก</button>
              <button type="button" className="btn-ghost" onClick={() => setRenamingName(false)}>
                ยกเลิก
              </button>
            </form>
          ) : (
            <>
              <h1 className="course-title">{profileUser.display_name}</h1>
              {isOwnProfile && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setNameDraft(profileUser.display_name);
                    setRenamingName(true);
                  }}
                >
                  เปลี่ยนชื่อ
                </button>
              )}
            </>
          )}
          <span className={`role-pill role-${profileUser.role.toLowerCase()}`}>
            {profileUser.role}
          </span>
        </div>
      </section>

      <section>
        <div className="card profile-stats">
          <div className="ranking-stat">
            <strong>{review_count}</strong>
            <span className="muted small">รีวิวทั้งหมด</span>
          </div>
          <div className="ranking-stat">
            <strong>{total_likes}</strong>
            <span className="muted small">ยอดถูกใจรวม</span>
          </div>
        </div>
      </section>

      {isOwnProfile && (
        <section>
          <h2>วิชาที่มีสิทธิ์รีวิว</h2>
          <p className="muted small">
            รายวิชาที่คุณเคยลงทะเบียนเรียนจริง — เฉพาะรายการเหล่านี้เท่านั้นที่คุณเขียนรีวิวได้
          </p>
          {enrollments?.length === 0 ? (
            <p className="muted">ยังไม่มีข้อมูลการลงทะเบียนเรียน</p>
          ) : (
            <div className="enrollment-list">
              {enrollments?.map((en) => (
                <Link
                  to={`/course/${en.course_id}`}
                  key={en.enrollment_id}
                  className="card enrollment-card"
                >
                  <div>
                    <span className="badge">{en.course_code}</span>
                    <strong>{en.course_name}</strong>
                    <div className="meta">
                      {en.academic_year} / เทอม {en.semester} / sec {en.section}
                    </div>
                  </div>
                  <span
                    className={`enrollment-status ${
                      en.reviewed ? "enrollment-reviewed" : "enrollment-pending"
                    }`}
                  >
                    {en.reviewed ? "รีวิวแล้ว" : "ยังไม่ได้รีวิว — เขียนเลย"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <h2>ประวัติการรีวิว</h2>
        {reviews.length === 0 ? (
          <p className="muted">ยังไม่มีรีวิว</p>
        ) : (
          reviews.map((r) => (
            <Link to={`/course/${r.course_id}`} key={r.review_id} className="card review-card profile-review-link">
              <div className="meta">
                <span className="badge">{r.course_code}</span>
                {r.course_name} · {r.academic_year}/{r.semester}
              </div>
              <p className="review-content">{r.content}</p>
              <div className="meta">♡ {r.like_count} ถูกใจ</div>
            </Link>
          ))
        )}
      </section>
    </>
  );
}
