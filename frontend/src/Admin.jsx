import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./AuthContext.jsx";

/**
 * /admin — Moderation queue.
 *
 * Lists every review the system auto-hid (report_count >= 5) and lets an
 * admin resolve each one:
 *   Keep   — restore to ACTIVE and reset report_count to 0
 *   Delete — soft-delete (status = DELETED)
 * The route is admin-only in App.jsx, and the API re-checks the role.
 */
export default function Admin() {
  const { user } = useAuth();

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api("/admin/reports", { userId: user.user_id });
      setReviews(data.reviews || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user.user_id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAction(reviewId, action) {
    setError("");
    setSuccess("");
    setBusyId(reviewId);
    try {
      const data = await api(`/admin/reviews/${reviewId}/action`, {
        method: "POST",
        userId: user.user_id,
        body: { action },
      });
      setSuccess(`รีวิว #${reviewId}: ${data.message}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <h1>คิวตรวจสอบรีวิว</h1>
      <p className="muted">
        รีวิวที่ถูกรายงานครบ 5 ครั้งและถูกซ่อนอัตโนมัติ รอการตัดสินใจของผู้ดูแลระบบ
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {loading ? (
        <p className="muted">Loading queue…</p>
      ) : reviews.length === 0 ? (
        <div className="card empty-state">
          <strong>คิวว่าง 🎉</strong>
          <p className="muted">ไม่มีรีวิวที่รอตรวจสอบในขณะนี้</p>
        </div>
      ) : (
        <div className="admin-list">
          {reviews.map((r) => (
            <article className="card admin-card" key={r.review_id}>
              <div className="admin-card-head">
                <div>
                  <span className="badge">{r.course_code}</span>
                  <Link to={`/course/${r.course_id}`} className="admin-course">
                    {r.course_name}
                  </Link>
                </div>
                <span className="report-badge">{r.report_count} reports</span>
              </div>

              <blockquote className="admin-quote">{r.content}</blockquote>

              <div className="meta">
                review #{r.review_id} · โดย {r.reviewer_name} ·{" "}
                {r.academic_year}/{r.semester} · sec {r.section}
              </div>

              <div className="admin-actions">
                <button
                  type="button"
                  className="btn btn-keep"
                  onClick={() => handleAction(r.review_id, "KEEP")}
                  disabled={busyId !== null}
                >
                  {busyId === r.review_id ? "…" : "✓ Keep"}
                </button>
                <button
                  type="button"
                  className="btn btn-delete"
                  onClick={() => handleAction(r.review_id, "DELETE")}
                  disabled={busyId !== null}
                >
                  {busyId === r.review_id ? "…" : "🗑 Delete"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
