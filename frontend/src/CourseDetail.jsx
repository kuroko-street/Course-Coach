import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

import { api } from "./api.js";
import { useAuth } from "./AuthContext.jsx";

import {
  LikertForm,
  defaultRatings,
  DETAIL_RATING_FIELDS,
  RATING_LABELS,
  recommendationLabel,
  satisfactionLabel,
  StarDisplay,
} from "./RatingStars.jsx";

/**
 * /course/:id — Course Detail
 *
 * แสดงรายละเอียดรายวิชา คะแนนรีวิวเฉลี่ย อาจารย์ผู้สอน
 * ภาคการศึกษาที่เปิดสอน และฟอร์มเขียนรีวิว
 *
 * รีวิวของผู้ใช้จะไม่แสดงทั้งหมดในหน้านี้
 * แต่จะไปแสดงที่ /course/:id/reviews ผ่านปุ่ม See more
 */
export default function CourseDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [course, setCourse] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [enrollments, setEnrollments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState("");

  const [form, setForm] = useState({
    content: "",
    ratings: defaultRatings(),
  });

  /* =========================
     LOAD DATA
     ========================= */

  async function loadCourse() {
    const data = await api(`/courses/${id}`);
    setCourse(data);
  }

  async function loadReviews() {
    const data = await api(`/courses/${id}/reviews`, {
      userId: user?.user_id,
    });

    setReviews(data.reviews || []);
  }

  async function loadEnrollments() {
    const data = await api(`/courses/${id}/enrollments/me`, {
      userId: user?.user_id,
    });

    const rows = data.enrollments || [];

    setEnrollments(rows);

    setSelectedEnrollmentId(
      rows.length ? String(rows[0].enrollment_id) : ""
    );
  }

  async function loadAll() {
    setLoading(true);
    setError("");

    try {
      await Promise.all([
        loadCourse(),
        loadReviews(),
        loadEnrollments(),
      ]);
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

  /* =========================
     SUBMIT REVIEW
     ========================= */

  async function handleSubmit(e) {
    e.preventDefault();

    setError("");
    setSuccess("");

    const enrollment = enrollments.find(
      (en) =>
        String(en.enrollment_id) === selectedEnrollmentId
    );

    if (!enrollment) {
      setError(
        "กรุณาเลือกภาคการศึกษาที่คุณลงทะเบียนเรียนวิชานี้"
      );
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

          /*
           * ใช้ DB เดิม 6 fields
           *
           * rating_difficulty เดิม
           * ถูกใช้เป็น "การแนะนำรายวิชา"
           */
          rating_satisfaction:
            form.ratings.satisfaction,

          rating_difficulty:
            form.ratings.difficulty,

          rating_workload:
            form.ratings.workload,

          rating_content:
            form.ratings.content,

          rating_teaching:
            form.ratings.teaching,

          rating_exam:
            form.ratings.exam,
        },
      });

      setSuccess(
        `ส่งรีวิวเรียบร้อย (review #${data.review_id})`
      );

      setForm({
        content: "",
        ratings: defaultRatings(),
      });

      setReviewModalOpen(false);

      await Promise.all([
        loadCourse(),
        loadReviews(),
        loadEnrollments(),
      ]);
    } catch (err) {
      setError(
        `Submission failed: ${err.message}`
      );
    } finally {
      setSubmitting(false);
    }
  }

  /* =========================
     CALCULATED VALUES
     ========================= */

  const overallAverage =
    Number(
      course?.averages?.avg_satisfaction
    ) || 0;

  /*
   * DB ใช้ชื่อ avg_difficulty
   * แต่ระบบปัจจุบันตีความเป็น
   * "คะแนนการแนะนำรายวิชา"
   */
  const recommendationAverage =
    Number(
      course?.averages?.avg_difficulty
    ) || 0;

  /* =========================
     LOADING / ERROR
     ========================= */

  if (loading) {
    return (
      <p className="muted">
        Loading…
      </p>
    );
  }

  if (!course) {
    return (
      <section>
        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        <Link
          to="/"
          className="back-link"
        >
          ← Back to catalog
        </Link>
      </section>
    );
  }

  /* =========================
     PAGE
     ========================= */

  return (
    <>
      {/* Back */}

      <Link
        to="/"
        className="back-link"
      >
        ← Back to catalog
      </Link>

      {/* =====================
          COURSE HEADER
          ===================== */}

      <section>
        <span className="badge">
          {course.course_code}
        </span>

        <h1 className="course-title">
          {course.course_name}
        </h1>

        <p className="muted">
          {course.department}
        </p>

        {course.tags?.length > 0 && (
          <div className="tag-chips">
            {course.tags.map((t) => (
              <Link
                key={t.tag_id}
                to={`/?search=${encodeURIComponent(
                  t.tag_name
                )}`}
                className="tag-chip"
              >
                #{t.tag_name}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Alerts */}

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          {success}
        </div>
      )}

      {/* =====================
          COURSE DETAIL
          ===================== */}

      <section>
        <h2>
          รายละเอียดรายวิชา
        </h2>

        <div className="card detail-grid">
          <div>
            <strong>
              เงื่อนไขรายวิชา
            </strong>

            <p>
              {course.prerequisites ||
                "ไม่มีข้อมูล"}
            </p>
          </div>

          <div>
            <strong>
              เนื้อหาที่เรียน
            </strong>

            <p>
              {course.syllabus ||
                "ไม่มีข้อมูล"}
            </p>
          </div>

          <div>
            <strong>
              รูปแบบการสอน
            </strong>

            <p>
              {course.teaching_format ||
                "ไม่มีข้อมูล"}
            </p>
          </div>

          <div>
            <strong>
              ภาระงาน
            </strong>

            <p>
              {course.workload ||
                "ไม่มีข้อมูล"}
            </p>
          </div>

          <div>
            <strong>
              วิธีการประเมินผล
            </strong>

            <p>
              {course.assessment ||
                "ไม่มีข้อมูล"}
            </p>
          </div>
        </div>
      </section>

      {/* =====================
          RATING SUMMARY
          ===================== */}

      {Number(
        course.averages?.review_count
      ) > 0 && (
        <section>
          <h2>
            คะแนนรีวิวรายวิชา
          </h2>

          {/* Satisfaction */}

          <div className="card course-rating-summary">
            <div className="overall-score-box">
              {overallAverage.toFixed(1)}
            </div>

            <div>
              <strong>
                ⭐ ความพึงพอใจโดยรวม
              </strong>

              <p className="muted small">
                {satisfactionLabel(
                  overallAverage
                )}
              </p>

              <p className="muted small">
                {
                  course.averages
                    .review_count
                }{" "}
                รีวิว
              </p>
            </div>
          </div>

          {/* Recommendation */}

          <div className="card course-rating-summary">
            <div className="overall-score-box">
              {recommendationAverage.toFixed(
                1
              )}
            </div>

            <div>
              <strong>
                👍 การแนะนำรายวิชา
              </strong>

              <p className="muted small">
                {recommendationLabel(
                  recommendationAverage
                )}
              </p>
            </div>
          </div>

          {/* Detail Ratings */}

          <h3>
            คะแนนเฉลี่ยรายด้าน
          </h3>

          <div className="card rating-breakdown">
            {DETAIL_RATING_FIELDS.map(
              (field) => {
                const score =
                  Number(
                    course.averages?.[
                      `avg_${field}`
                    ]
                  ) || 0;

                return (
                  <div
                    className="rating-row"
                    key={field}
                  >
                    <span className="rating-label">
                      {
                        RATING_LABELS[
                          field
                        ]
                      }
                    </span>

                    <span>
                      <StarDisplay
                        value={Math.round(
                          score
                        )}
                      />

                      <strong className="rating-number">
                        {score.toFixed(1)}
                      </strong>
                    </span>
                  </div>
                );
              }
            )}
          </div>
        </section>
      )}

      {/* =====================
          INSTRUCTORS
          ===================== */}

      {course.instructors?.length >
        0 && (
        <section>
          <h2>
            อาจารย์ผู้สอน
          </h2>

          <div className="instructor-grid">
            {course.instructors.map(
              (inst) => (
                <div
                  className="card instructor-card"
                  key={
                    inst.instructor_id
                  }
                >
                  <strong>
                    {inst.name}
                  </strong>

                  {inst.bio && (
                    <p className="muted small">
                      {inst.bio}
                    </p>
                  )}

                  {inst.teaching_style && (
                    <p>
                      <span className="meta-label">
                        สไตล์การสอน:
                      </span>{" "}
                      {
                        inst.teaching_style
                      }
                    </p>
                  )}

                  {inst.grading_style && (
                    <p>
                      <span className="meta-label">
                        การให้คะแนน:
                      </span>{" "}
                      {
                        inst.grading_style
                      }
                    </p>
                  )}
                </div>
              )
            )}
          </div>
        </section>
      )}

      {/* =====================
          OFFERINGS
          ===================== */}

      <section>
        <h2>
          ภาคการศึกษาที่เปิดสอน
        </h2>

        <p className="muted small">
          ข้อมูลจำลองจาก API
          ระบบทะเบียนมหาวิทยาลัย
        </p>

        <div className="offering-grid">
          {course.offerings?.map(
            (offering) => (
              <div
                className="card offering-card"
                key={`${offering.academic_year}-${offering.semester}`}
              >
                <strong>
                  ปีการศึกษา{" "}
                  {
                    offering.academic_year
                  }{" "}
                  / เทอม{" "}
                  {offering.semester}
                </strong>

                <div className="meta">
                  Sections:{" "}
                  {offering.sections.join(
                    ", "
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </section>

      {/* =====================
          REVIEWS
          ===================== */}

      <section>
        <div className="reviews-section-header">
          <h2>
            รีวิว ({reviews.length})
          </h2>

          {reviews.length > 0 && (
            <Link
              to={`/course/${id}/reviews`}
              className="see-more-btn"
            >
              See more →
            </Link>
          )}
        </div>

        {reviews.length === 0 && (
          <p className="muted">
            ยังไม่มีรีวิว —
            เป็นคนแรกเลย!
          </p>
        )}
      </section>

      {/* =====================
          WRITE REVIEW
          ===================== */}

      <section>
        <h2>
          เขียนรีวิว
        </h2>

        {enrollments.length === 0 ? (
          <div className="card empty-state">
            <strong>
              คุณไม่มีสิทธิ์เขียนรีวิววิชานี้
            </strong>

            <p className="muted">
              ไม่พบข้อมูลว่าคุณเคยลงทะเบียนเรียนวิชานี้
              รีวิวเปิดให้เฉพาะนักศึกษาที่เคยลงทะเบียนเรียนจริงเท่านั้น
            </p>
          </div>
        ) : (
          <button
            type="button"
            className="write-review-trigger"
            onClick={() =>
              setReviewModalOpen(true)
            }
          >
            <div>
              <strong>
                ✏️
                เขียนรีวิวรายวิชานี้
              </strong>

              <span>
                แชร์ประสบการณ์และให้คะแนนรายด้าน
              </span>
            </div>

            <span className="write-review-arrow">
              ›
            </span>
          </button>
        )}
      </section>

      {/* =====================
          WRITE REVIEW MODAL
          ===================== */}

      {reviewModalOpen && (
        <div
          className="review-modal-overlay"
          onMouseDown={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              setReviewModalOpen(
                false
              );
            }
          }}
        >
          <div
            className="review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-modal-title"
          >
            {/* Modal Header */}

            <div className="review-modal-header">
              <div>
                <h2 id="review-modal-title">
                  เขียนรีวิว
                </h2>

                <p className="muted">
                  ให้คะแนนแต่ละด้านจาก
                  1–5
                </p>
              </div>

              <button
                type="button"
                className="review-modal-close"
                onClick={() =>
                  setReviewModalOpen(
                    false
                  )
                }
                aria-label="ปิด"
              >
                ×
              </button>
            </div>

            {/* Form */}

            <form
              className="review-modal-form"
              onSubmit={handleSubmit}
            >
              {/* Enrollment */}

              <div>
                <label htmlFor="enrollment">
                  ภาคการศึกษาที่ลงทะเบียนเรียน
                </label>

                <select
                  id="enrollment"
                  value={
                    selectedEnrollmentId
                  }
                  onChange={(e) =>
                    setSelectedEnrollmentId(
                      e.target.value
                    )
                  }
                >
                  {enrollments.map(
                    (enrollment) => (
                      <option
                        key={
                          enrollment.enrollment_id
                        }
                        value={
                          enrollment.enrollment_id
                        }
                      >
                        {
                          enrollment.academic_year
                        }{" "}
                        / เทอม{" "}
                        {
                          enrollment.semester
                        }{" "}
                        / sec{" "}
                        {
                          enrollment.section
                        }
                        {enrollment.reviewed
                          ? " (รีวิวแล้ว)"
                          : ""}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* Comment */}

              <div>
                <label htmlFor="content">
                  ความคิดเห็น
                </label>

                <textarea
                  id="content"
                  rows={4}
                  placeholder="เล่าประสบการณ์เกี่ยวกับรายวิชานี้..."
                  value={form.content}
                  onChange={(e) =>
                    setForm(
                      (previous) => ({
                        ...previous,
                        content:
                          e.target
                            .value,
                      })
                    )
                  }
                  required
                />
              </div>

              {/* Likert Guide */}

              <div className="likert-guide">
                <strong>
                  เกณฑ์การประเมิน
                </strong>

                <span>
                  1 =
                  ไม่เห็นด้วยอย่างยิ่ง
                </span>

                <span>
                  2 = ไม่เห็นด้วย
                </span>

                <span>
                  3 = ปานกลาง
                </span>

                <span>
                  4 = เห็นด้วย
                </span>

                <span>
                  5 =
                  เห็นด้วยอย่างยิ่ง
                </span>
              </div>

              {/* Likert Questions */}

              <LikertForm
                ratings={
                  form.ratings
                }
                onChange={(
                  ratings
                ) =>
                  setForm(
                    (previous) => ({
                      ...previous,
                      ratings,
                    })
                  )
                }
              />

              {/* Footer */}

              <div className="review-modal-footer">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    setReviewModalOpen(
                      false
                    )
                  }
                >
                  ยกเลิก
                </button>

                <button
                  type="submit"
                  disabled={
                    submitting
                  }
                >
                  {submitting
                    ? "กำลังส่ง…"
                    : "ส่งรีวิว"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}