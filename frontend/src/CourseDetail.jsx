import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, apiUpload } from "./api.js";
import { useAuth } from "./AuthContext.jsx";
import ReviewCard from "./ReviewCard.jsx";
import {
  RatingForm,
  defaultRatings,
  RATING_FIELDS,
  RATING_LABELS,
  StarDisplay,
} from "./RatingStars.jsx";

const MAX_FILE_MB = 20;

/**
 * /course/:id — Course Detail.
 *
 * Shows the course header + deep detail fields (FR-4), the instructor(s)
 * teaching it (FR-5), the term/section offerings the university API
 * reports, the ACTIVE reviews (each with rating breakdown, like, comments,
 * files, and owner edit/delete), and the "write a review" form.
 *
 * The write-review form is gated by enrollment: a student may only submit a
 * review for a (course, academic_year, semester, section) they were
 * actually enrolled in (`GET /courses/:id/enrollments/me`). If they have no
 * enrollment for this course at all, the form is replaced with a notice
 * instead of a dropdown of terms — the backend enforces the same rule on
 * `POST /api/reviews`, this is just so the student isn't left guessing why
 * a submission got rejected.
 */
export default function CourseDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [course, setCourse] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reportingId, setReportingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState("");
  const [form, setForm] = useState({
    content: "",
    ratings: defaultRatings(),
  });
  const [reviewFile, setReviewFile] = useState(null);
  const [reviewFileInputKey, setReviewFileInputKey] = useState(0);

  async function loadCourse() {
    setCourse(await api(`/courses/${id}`));
  }

  async function loadReviews() {
    const data = await api(`/courses/${id}/reviews`, { userId: user?.user_id });
    setReviews(data.reviews || []);
  }

  async function loadEnrollments() {
    const data = await api(`/courses/${id}/enrollments/me`, { userId: user?.user_id });
    const rows = data.enrollments || [];
    setEnrollments(rows);
    setSelectedEnrollmentId(rows.length ? String(rows[0].enrollment_id) : "");
  }

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadCourse(), loadReviews(), loadEnrollments()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const enrollment = enrollments.find(
      (en) => String(en.enrollment_id) === selectedEnrollmentId
    );
    if (!enrollment) {
      setError("กรุณาเลือกภาคการศึกษาที่คุณลงทะเบียนเรียนวิชานี้");
      return;
    }
    if (reviewFile && reviewFile.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`ไฟล์ต้องมีขนาดไม่เกิน ${MAX_FILE_MB}MB`);
      return;
    }

    setSubmitting(true);
    try {
      const data = await api("/reviews", {
        method: "POST",
        userId: user.user_id,
        body: {
          course_id: Number(id),
          content: form.content.trim(),
          academic_year: enrollment.academic_year,
          semester: enrollment.semester,
          section: enrollment.section,
          rating_satisfaction: form.ratings.satisfaction,
          rating_difficulty: form.ratings.difficulty,
          rating_workload: form.ratings.workload,
          rating_content: form.ratings.content,
          rating_teaching: form.ratings.teaching,
          rating_exam: form.ratings.exam,
        },
      });

      let message = `ส่งรีวิวเรียบร้อย (review #${data.review_id})`;
      if (reviewFile) {
        try {
          await apiUpload(`/reviews/${data.review_id}/files`, {
            file: reviewFile,
            userId: user.user_id,
          });
          message += " พร้อมไฟล์แนบ";
        } catch (err) {
          message += ` (แต่แนบไฟล์ไม่สำเร็จ: ${err.message})`;
        }
      }
      setSuccess(message);
      setForm({ content: "", ratings: defaultRatings() });
      setReviewFile(null);
      setReviewFileInputKey((k) => k + 1);
      await Promise.all([loadReviews(), loadEnrollments()]);
    } catch (err) {
      setError(`Submission failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReport(reviewId) {
    setError("");
    setSuccess("");
    setReportingId(reviewId);
    try {
      const data = await api(`/reviews/${reviewId}/report`, {
        method: "POST",
        userId: user.user_id,
      });
      setSuccess(
        data.auto_hidden
          ? `รีวิว #${reviewId} ถูกซ่อนอัตโนมัติ (ถูกรายงานครบ ${data.report_count} ครั้ง) และส่งเข้าคิวผู้ดูแลระบบแล้ว`
          : `รายงานรีวิว #${reviewId} แล้ว (${data.report_count}/5)`
      );
      // A review that just crossed the threshold disappears from this list.
      await loadReviews();
    } catch (err) {
      setError(`Report failed: ${err.message}`);
    } finally {
      setReportingId(null);
    }
  }

  function handleReviewDeleted(reviewId) {
    setReviews((prev) => prev.filter((r) => r.review_id !== reviewId));
    setSuccess(`ลบรีวิว #${reviewId} แล้ว`);
    loadEnrollments();
  }

  function handleReviewUpdated(reviewId, patch) {
    setReviews((prev) =>
      prev.map((r) => (r.review_id === reviewId ? { ...r, ...patch } : r))
    );
    setSuccess(`แก้ไขรีวิว #${reviewId} แล้ว`);
  }

  if (loading) return <p className="muted">Loading…</p>;

  if (!course) {
    return (
      <section>
        {error && <div className="alert alert-error">{error}</div>}
        <Link to="/" className="back-link">
          ← Back to catalog
        </Link>
      </section>
    );
  }

  return (
    <>
      <Link to="/" className="back-link">
        ← Back to catalog
      </Link>

      {/* Course header */}
      <section>
        <span className="badge">{course.course_code}</span>
        <h1 className="course-title">{course.course_name}</h1>
        <p className="muted">{course.department}</p>
        {course.tags?.length > 0 && (
          <div className="tag-chips">
            {course.tags.map((t) => (
              <Link key={t.tag_id} to={`/?search=${encodeURIComponent(t.tag_name)}`} className="tag-chip">
                #{t.tag_name}
              </Link>
            ))}
          </div>
        )}
      </section>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Deep course detail (FR-4) */}
      <section>
        <h2>รายละเอียดรายวิชา</h2>
        <div className="card detail-grid">
          <div>
            <strong>เงื่อนไขรายวิชา</strong>
            <p>{course.prerequisites || "ไม่มีข้อมูล"}</p>
          </div>
          <div>
            <strong>เนื้อหาที่เรียน</strong>
            <p>{course.syllabus || "ไม่มีข้อมูล"}</p>
          </div>
          <div>
            <strong>รูปแบบการสอน</strong>
            <p>{course.teaching_format || "ไม่มีข้อมูล"}</p>
          </div>
          <div>
            <strong>ภาระงาน</strong>
            <p>{course.workload || "ไม่มีข้อมูล"}</p>
          </div>
          <div>
            <strong>วิธีการประเมินผล</strong>
            <p>{course.assessment || "ไม่มีข้อมูล"}</p>
          </div>
        </div>
      </section>

      {/* Average rating per aspect, across this course's ACTIVE reviews */}
      {Number(course.averages?.review_count) > 0 && (
        <section>
          <h2>คะแนนเฉลี่ยจากรีวิว</h2>
          <div className="card rating-breakdown">
            {RATING_FIELDS.map((f) => (
              <div className="rating-row" key={f}>
                <span className="rating-label">{RATING_LABELS[f]}</span>
                <span>
                  <StarDisplay value={Math.round(Number(course.averages[`avg_${f}`]) || 0)} />
                  <span className="muted small"> ({course.averages[`avg_${f}`]})</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Instructors (FR-5) */}
      {course.instructors?.length > 0 && (
        <section>
          <h2>อาจารย์ผู้สอน</h2>
          <div className="instructor-grid">
            {course.instructors.map((inst) => (
              <div className="card instructor-card" key={inst.instructor_id}>
                <strong>{inst.name}</strong>
                {inst.bio && <p className="muted small">{inst.bio}</p>}
                {inst.teaching_style && (
                  <p>
                    <span className="meta-label">สไตล์การสอน:</span> {inst.teaching_style}
                  </p>
                )}
                {inst.grading_style && (
                  <p>
                    <span className="meta-label">การให้คะแนน:</span> {inst.grading_style}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Offerings from the (mock) university registrar API */}
      <section>
        <h2>ภาคการศึกษาที่เปิดสอน</h2>
        <p className="muted small">
          ข้อมูลจำลองจาก API ระบบทะเบียนมหาวิทยาลัย
        </p>
        <div className="offering-grid">
          {course.offerings?.map((o) => (
            <div className="card offering-card" key={`${o.academic_year}-${o.semester}`}>
              <strong>
                ปีการศึกษา {o.academic_year} / เทอม {o.semester}
              </strong>
              <div className="meta">Sections: {o.sections.join(", ")}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Reviews */}
      <section>
        <h2>รีวิว ({reviews.length})</h2>
        {reviews.length === 0 ? (
          <p className="muted">ยังไม่มีรีวิว — เป็นคนแรกเลย!</p>
        ) : (
          reviews.map((r) => (
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

      {/* Write a review — gated by enrollment (FR: only enrolled students
          may review a course) */}
      <section>
        <h2>เขียนรีวิว</h2>
        {enrollments.length === 0 ? (
          <div className="card empty-state">
            <strong>คุณไม่มีสิทธิ์เขียนรีวิววิชานี้</strong>
            <p className="muted">
              ไม่พบข้อมูลว่าคุณเคยลงทะเบียนเรียนวิชานี้ — รีวิวเปิดให้เฉพาะ
              นักศึกษาที่เคยลงทะเบียนเรียนจริงเท่านั้น
            </p>
          </div>
        ) : (
          <form className="card" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="enrollment">ภาคการศึกษาที่ลงทะเบียนเรียน</label>
              <select
                id="enrollment"
                value={selectedEnrollmentId}
                onChange={(e) => setSelectedEnrollmentId(e.target.value)}
              >
                {enrollments.map((en) => (
                  <option key={en.enrollment_id} value={en.enrollment_id}>
                    {en.academic_year} / เทอม {en.semester} / sec {en.section}
                    {en.reviewed ? " (รีวิวแล้ว)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="content">ความคิดเห็น</label>
              <textarea
                id="content"
                rows={4}
                placeholder="วิชานี้เป็นอย่างไรบ้าง?"
                value={form.content}
                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                required
              />
            </div>

            <RatingForm
              ratings={form.ratings}
              onChange={(ratings) => setForm((prev) => ({ ...prev, ratings }))}
            />

            <div>
              <label htmlFor="review-file">
                แนบไฟล์เอกสารสรุป/ชีทเรียน (ถ้ามี, สูงสุด {MAX_FILE_MB}MB)
              </label>
              <input
                key={reviewFileInputKey}
                id="review-file"
                type="file"
                onChange={(e) => setReviewFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="form-footer">
              <span className="meta">
                กำลังเขียนในนาม <strong>{user.username}</strong>
              </span>
              <button type="submit" disabled={submitting}>
                {submitting ? "กำลังส่ง…" : "ส่งรีวิว"}
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
