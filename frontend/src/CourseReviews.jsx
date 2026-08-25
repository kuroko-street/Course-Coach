import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "./api.js";
import { useAuth } from "./AuthContext.jsx";
import ReviewCard from "./ReviewCard.jsx";

export default function CourseReviews() {

  const { id } = useParams();
  const { user } = useAuth();

  const [course, setCourse] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportingId, setReportingId] = useState(null);
  const [error, setError] = useState("");

    const [selectedYear, setSelectedYear] = useState("all");
    const [selectedSemester, setSelectedSemester] = useState("all");
    const [sortOrder, setSortOrder] = useState("newest");

    const years = [
  ...new Set(reviews.map((r) => String(r.academic_year))),
].sort((a, b) => Number(b) - Number(a));

const semesters = [
  ...new Set(reviews.map((r) => String(r.semester))),
].sort();

const filteredReviews = reviews
  .filter((r) => {
    if (
      selectedYear !== "all" &&
      String(r.academic_year) !== selectedYear
    ) {
      return false;
    }

    if (
      selectedSemester !== "all" &&
      String(r.semester) !== selectedSemester
    ) {
      return false;
    }

    return true;
  })
  .sort((a, b) => {
    if (sortOrder === "oldest") {
      return Number(a.review_id) - Number(b.review_id);
    }

    if (sortOrder === "highest") {
      return (
        Number(b.rating_satisfaction) -
        Number(a.rating_satisfaction)
      );
    }

    if (sortOrder === "lowest") {
      return (
        Number(a.rating_satisfaction) -
        Number(b.rating_satisfaction)
      );
    }

    return Number(b.review_id) - Number(a.review_id);
  });

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [courseData, reviewData] = await Promise.all([
        api(`/courses/${id}`),
        api(`/courses/${id}/reviews`, {
          userId: user?.user_id,
        }),
      ]);

      setCourse(courseData);
      setReviews(reviewData.reviews || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [id]);

  async function handleReport(reviewId) {
    setReportingId(reviewId);
    setError("");

    try {
      await api(`/reviews/${reviewId}/report`, {
        method: "POST",
        userId: user.user_id,
      });

      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setReportingId(null);
    }
  }

  function handleReviewDeleted(reviewId) {
    setReviews((prev) =>
      prev.filter((r) => r.review_id !== reviewId)
    );
  }

  function handleReviewUpdated(reviewId, patch) {
    setReviews((prev) =>
      prev.map((r) =>
        r.review_id === reviewId
          ? { ...r, ...patch }
          : r
      )
    );
  }

  if (loading) {
    return <p className="muted">Loading…</p>;
  }

  return (
    <>
      <Link
        to={`/course/${id}`}
        className="back-link"
      >
        ← กลับไปหน้ารายวิชา
      </Link>

      <section className="all-reviews-header">
        <h1>
          รีวิวทั้งหมด
        </h1>

        {course && (
          <>
            <h2>
              {course.course_code} {course.course_name}
            </h2>

            <p className="muted">
              รีวิวทั้งหมด {reviews.length} รายการ
            </p>
          </>
        )}
      </section>
    
      <div className="review-filters">
        <div>
          <label>ปีการศึกษา</label>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            <option value="all">ทั้งหมด</option>

            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>เทอม</label>

          <select
            value={selectedSemester}
            onChange={(e) => setSelectedSemester(e.target.value)}
          >
            <option value="all">ทั้งหมด</option>

            {semesters.map((semester) => (
              <option key={semester} value={semester}>
                เทอม {semester}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>เรียงตาม</label>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="newest">ล่าสุด</option>
            <option value="oldest">เก่าสุด</option>
            <option value="highest">ความพึงพอใจสูงสุด</option>
            <option value="lowest">ความพึงพอใจต่ำสุด</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

     {reviews.length > 0 && (
        <p className="muted small">
          แสดง {filteredReviews.length} จาก {reviews.length} รีวิว
        </p>
      )}

     <section>
  {reviews.length === 0 ? (
    <div className="card empty-state">
      ยังไม่มีรีวิวในรายวิชานี้
    </div>
  ) : filteredReviews.length === 0 ? (
    <div className="card empty-state">
      ไม่พบรีวิวที่ตรงกับตัวกรอง
    </div>
  ) : (
    filteredReviews.map((r) => (
      <ReviewCard
        key={r.review_id}
        review={r}
        user={user}
        onReport={handleReport}
        reportingId={reportingId}
        onDeleted={handleReviewDeleted}
        onUpdated={handleReviewUpdated}
      />
    ))
  )}
</section>
    </>
  );
}