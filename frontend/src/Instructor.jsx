import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "./api.js";
import Avatar from "./Avatar.jsx";

/**
 * /instructor/:id — read-only instructor profile page. Instructors have no
 * login account (only a row in `instructors`), so this page has no edit UI
 * and no auth-gated sections, unlike the student /profile/:id page.
 */
export default function Instructor() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api(`/instructors/${id}/profile`)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="muted">Loading…</p>;

  if (error || !data) {
    return (
      <section>
        {error && <div className="alert alert-error">{error}</div>}
        <Link to="/" className="back-link">
          ← Back to catalog
        </Link>
      </section>
    );
  }

  const { instructor, courses } = data;

  return (
    <>
      <Link to="/" className="back-link">
        ← กลับไปหน้ารายวิชา
      </Link>

      <section className="profile-header">
        <Avatar url={null} size={64} />
        <div>
          <h1 className="course-title">{instructor.name}</h1>
          <span className="muted small">โปรไฟล์อาจารย์</span>
        </div>
      </section>

      {instructor.bio && (
        <section>
          <div className="card">
            <p>{instructor.bio}</p>
          </div>
        </section>
      )}

      <section>
        <h2>วิชาที่อาจารย์สอน</h2>
        {courses.length === 0 ? (
          <p className="muted">ยังไม่มีวิชาที่สอน</p>
        ) : (
          <div className="enrollment-list">
            {courses.map((c) => (
              <Link to={`/course/${c.course_id}`} key={c.course_id} className="card enrollment-card">
                <div>
                  <span className="badge">{c.course_code}</span>
                  <strong>{c.course_name}</strong>
                  <div className="meta">{c.department}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
