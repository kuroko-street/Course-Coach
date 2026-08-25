import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./AuthContext.jsx";
import ReviewCard from "./ReviewCard.jsx";


const SORT_OPTIONS = [
  { value: "newest", label: "ใหม่ที่สุด" },
  { value: "likes", label: "ไลก์มากที่สุด" },
  { value: "comments", label: "คอมเมนต์มากที่สุด" },
];


export default function CourseReviewsPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [sort, setSort] = useState("newest");
  const [reportingId, setReportingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadReviews() {
    const data = await api(`/courses/${id}/reviews`);
    setReviews(data.reviews || []);
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([api(`/courses/${id}`), api(`/courses/${id}/reviews`)])
      .then(([courseData, reviewData]) => {
        setCourse(courseData);
        setReviews(reviewData.reviews || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const sortedReviews = useMemo(() => {
    return [...reviews].sort((left, right) => {
      if (sort === "likes") return Number(right.like_count) - Number(left.like_count) || right.review_id - left.review_id;
      if (sort === "comments") return Number(right.comment_count) - Number(left.comment_count) || right.review_id - left.review_id;
      return new Date(right.created_at) - new Date(left.created_at) || right.review_id - left.review_id;
    });
  }, [reviews, sort]);

  async function reportReview(reviewId) {
    setReportingId(reviewId);
    setError("");
    try {
      const result = await api(`/reviews/${reviewId}/report`, { method: "POST" });
      setSuccess(result.auto_hidden ? "รีวิวถูกรายงานครบและถูกซ่อนแล้ว" : `รายงานแล้ว (${result.report_count}/5)`);
      await loadReviews();
    } catch (err) {
      setError(err.message);
    } finally {
      setReportingId(null);
    }
  }

  if (loading) return <p className="muted">กำลังโหลดรีวิว…</p>;

  return (
    <section>
      <Link to={`/course/${id}`} className="back-link">← กลับไปหน้ารายวิชา</Link>
      <div className="page-heading-row">
        <div>
          <span className="badge">{course?.course_code}</span>
          <h1>รีวิวทั้งหมด</h1>
          <p className="muted">{course?.course_name}</p>
        </div>
        <div className="review-sort-control">
          <label htmlFor="review-sort">เรียงตาม</label>
          <select id="review-sort" value={sort} onChange={(event) => setSort(event.target.value)}>
            {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      {!sortedReviews.length ? (
        <div className="card empty-state">ยังไม่มีรีวิวในวิชานี้</div>
      ) : (
        sortedReviews.map((review) => (
          <ReviewCard
            key={review.review_id}
            review={review}
            user={user}
            onReport={reportReview}
            reportingId={reportingId}
            onDeleted={(reviewId) => setReviews((current) => current.filter((item) => item.review_id !== reviewId))}
            onUpdated={(reviewId, patch) => setReviews((current) => current.map((item) => item.review_id === reviewId ? { ...item, ...patch } : item))}
          />
        ))
      )}
    </section>
  );
}
