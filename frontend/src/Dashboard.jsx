import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api.js";

/**
 * /dashboard — FR-3: popularity ranking board.
 *
 * Ranks every course by average overall-satisfaction rating (ties broken by
 * review count), and shows total likes across a course's reviews as a
 * secondary popularity signal.
 */
export default function Dashboard() {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/dashboard/rankings")
      .then((data) => setRankings(data.rankings || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section>
      <h1>จัดอันดับความนิยม</h1>
      <p className="muted">
        จัดอันดับจากคะแนนความพึงพอใจเฉลี่ยของรีวิวจริง (ผู้เรียนที่เคยลงเรียนวิชานั้น)
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : rankings.length === 0 ? (
        <p className="muted">ยังไม่มีข้อมูลรายวิชา</p>
      ) : (
        <div className="ranking-list">
          {rankings.map((c, idx) => (
            <Link
              to={`/course/${c.course_id}`}
              key={c.course_id}
              className="card ranking-card"
            >
              <span className="ranking-rank">#{idx + 1}</span>
              <div className="ranking-body">
                <div>
                  <span className="badge">{c.course_code}</span>
                  <strong>{c.course_name}</strong>
                </div>
                <div className="meta">{c.department}</div>
              </div>
              <div className="ranking-stats">
                <div className="ranking-stat">
                  <strong>{c.avg_satisfaction ?? "–"}</strong>
                  <span className="muted small">คะแนนเฉลี่ย</span>
                </div>
                <div className="ranking-stat">
                  <strong>{c.review_count}</strong>
                  <span className="muted small">รีวิว</span>
                </div>
                <div className="ranking-stat">
                  <strong>{c.total_likes}</strong>
                  <span className="muted small">ถูกใจ</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
