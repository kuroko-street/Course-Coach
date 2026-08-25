import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, apiUploadMany } from "./api.js";
import { useAuth } from "./AuthContext.jsx";
import ReviewCard from "./ReviewCard.jsx";
import SummaryFileCard from "./components/SummaryFileCard.jsx";
import {
  RatingForm,
  defaultRatings,
  RATING_FIELDS,
  RATING_LABELS,
  StarDisplay,
} from "./RatingStars.jsx";

const MAX_FILE_MB = 20;
const MAX_FILES_PER_ROUND = 3;
const SUMMARY_FILE_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx", ".ppt", ".pptx"];

/**
 * /course/:id — Course Detail.
 *
 * Shows the course header + deep detail fields (FR-4), the instructor(s)
 * teaching it (FR-5), the term/section offerings the university API
 * reports, the ACTIVE reviews (each with rating breakdown, like, comments,
 * and owner edit/delete), plus a separate course-summary-file area.
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
  const [summaryFiles, setSummaryFiles] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [activeTab, setActiveTab] = useState("reviews");
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
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedUploadEnrollmentId, setSelectedUploadEnrollmentId] = useState("");
  const [selectedSummaryFiles, setSelectedSummaryFiles] = useState([]);
  const [summaryFileInputKey, setSummaryFileInputKey] = useState(0);
  const [summaryUploading, setSummaryUploading] = useState(false);
  const [summaryModalError, setSummaryModalError] = useState("");

  const [plans, setPlans] = useState([]);
  const [planAdd, setPlanAdd] = useState({ plan_id: "", academic_year: 2568, semester: "1" });
  const [planAdding, setPlanAdding] = useState(false);
  const [planMessage, setPlanMessage] = useState("");

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
    const reviewable = rows.filter((row) => !row.reviewed);
    setSelectedEnrollmentId(reviewable.length ? String(reviewable[0].enrollment_id) : "");
    setSelectedUploadEnrollmentId(rows.length ? String(rows[0].enrollment_id) : "");
  }

  async function loadSummaryFiles() {
    const data = await api(`/courses/${id}/summary-files`);
    setSummaryFiles(data.files || []);
  }

  async function loadPlans() {
    const data = await api("/plans", { userId: user?.user_id });
    const rows = data.plans || [];
    setPlans(rows);
    setPlanAdd((prev) => ({ ...prev, plan_id: rows.length ? String(rows[0].plan_id) : "" }));
  }

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      await Promise.all([
        loadCourse(), loadReviews(), loadEnrollments(), loadPlans(), loadSummaryFiles(),
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddToPlan(e) {
    e.preventDefault();
    setPlanMessage("");
    if (!planAdd.plan_id) {
      setPlanMessage("กรุณาสร้างแผนการเรียนก่อน (ไปที่เมนู “แผนการเรียน”)");
      return;
    }
    setPlanAdding(true);
    try {
      await api(`/plans/${planAdd.plan_id}/items`, {
        method: "POST",
        userId: user.user_id,
        body: {
          course_id: Number(id),
          academic_year: Number(planAdd.academic_year),
          semester: planAdd.semester,
        },
      });
      setPlanMessage("เพิ่มลงแผนการเรียนแล้ว");
    } catch (err) {
      setPlanMessage(err.message);
    } finally {
      setPlanAdding(false);
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

      setSuccess(`ส่งรีวิวเรียบร้อย (review #${data.review_id})`);
      setForm({ content: "", ratings: defaultRatings() });
      setReviewModalOpen(false);
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

  function selectSummaryFiles(event) {
    const files = Array.from(event.target.files || []);
    setSummaryModalError("");
    if (files.length > MAX_FILES_PER_ROUND) {
      setSummaryModalError(`หนึ่งรอบเลือกได้สูงสุด ${MAX_FILES_PER_ROUND} ไฟล์`);
      setSelectedSummaryFiles([]);
      setSummaryFileInputKey((key) => key + 1);
      return;
    }
    const invalid = files.find((file) => {
      const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
      return !SUMMARY_FILE_EXTENSIONS.includes(extension) || file.size > MAX_FILE_MB * 1024 * 1024;
    });
    if (invalid) {
      setSummaryModalError(`ไฟล์ ${invalid.name} ไม่รองรับหรือมีขนาดเกิน ${MAX_FILE_MB}MB`);
      setSelectedSummaryFiles([]);
      setSummaryFileInputKey((key) => key + 1);
      return;
    }
    setSelectedSummaryFiles(files);
  }

  async function handleSummaryUpload(event) {
    event.preventDefault();
    if (!selectedUploadEnrollmentId || !selectedSummaryFiles.length) return;
    setSummaryUploading(true);
    setSummaryModalError("");
    try {
      const result = await apiUploadMany(`/courses/${id}/summary-files`, {
        files: selectedSummaryFiles,
        fields: { enrollment_id: selectedUploadEnrollmentId },
      });
      setSuccess(
        `อัปโหลด ${result.created_count} ไฟล์แล้ว · เหลือ ${result.remaining_upload_rounds} รอบสำหรับเทอมนี้`
      );
      setSelectedSummaryFiles([]);
      setSummaryFileInputKey((key) => key + 1);
      setUploadModalOpen(false);
      setActiveTab("files");
      await loadSummaryFiles();
    } catch (err) {
      setSummaryModalError(err.message);
    } finally {
      setSummaryUploading(false);
    }
  }

  const reviewableEnrollments = enrollments.filter((row) => !row.reviewed);

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
              <Link
                to={`/instructor/${inst.instructor_id}`}
                className="card instructor-card instructor-card-link"
                key={inst.instructor_id}
              >
                <strong>{inst.name}</strong>
                {inst.bio && <p className="muted small">{inst.bio}</p>}
              </Link>
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

      {/* Add to a study plan (Story: plan credits before real registration) */}
      <section>
        <h2>เพิ่มลงแผนการเรียน</h2>
        {plans.length === 0 ? (
          <p className="muted">
            ยังไม่มีแผนการเรียน — ไปสร้างแผนที่เมนู{" "}
            <Link to="/plans">แผนการเรียน</Link> ก่อน
          </p>
        ) : (
          <form className="card quick-add-plan" onSubmit={handleAddToPlan}>
            <div>
              <label htmlFor="plan-select">แผน</label>
              <select
                id="plan-select"
                value={planAdd.plan_id}
                onChange={(e) => setPlanAdd((prev) => ({ ...prev, plan_id: e.target.value }))}
              >
                {plans.map((p) => (
                  <option key={p.plan_id} value={p.plan_id}>{p.plan_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="plan-year">ปีการศึกษา</label>
              <input
                id="plan-year"
                type="number"
                value={planAdd.academic_year}
                onChange={(e) => setPlanAdd((prev) => ({ ...prev, academic_year: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="plan-semester">เทอม</label>
              <select
                id="plan-semester"
                value={planAdd.semester}
                onChange={(e) => setPlanAdd((prev) => ({ ...prev, semester: e.target.value }))}
              >
                <option value="1">เทอม 1</option>
                <option value="2">เทอม 2</option>
                <option value="3">เทอม 3</option>
              </select>
            </div>
            <button type="submit" disabled={planAdding}>
              {planAdding ? "กำลังเพิ่ม…" : "เพิ่มลงแผน"}
            </button>
          </form>
        )}
        {planMessage && <p className="muted small">{planMessage}</p>}
      </section>

      <section>
        <h2>มีส่วนร่วมกับวิชานี้</h2>
        <div className="contribution-grid">
          <div className="contribution-card contribution-review">
            <div>
              <strong>📝 เขียนรีวิววิชานี้</strong>
              <p>แชร์ประสบการณ์และให้คะแนน</p>
            </div>
            <button
              type="button"
              className="btn contribution-review-button"
              disabled={!reviewableEnrollments.length}
              onClick={() => setReviewModalOpen(true)}
            >
              + รีวิว
            </button>
          </div>
          <div className="contribution-card contribution-file">
            <div>
              <strong>📤 อัปโหลดไฟล์สรุป</strong>
              <p>แบ่งปันชีทสรุปหรือไฟล์เรียน</p>
            </div>
            <button
              type="button"
              className="btn contribution-file-button"
              disabled={!enrollments.length}
              onClick={() => setUploadModalOpen(true)}
            >
              + อัปโหลด
            </button>
          </div>
        </div>
        {!enrollments.length && (
          <p className="muted small">ต้องมีประวัติว่าเคยเรียนวิชานี้ก่อนจึงจะรีวิวหรืออัปโหลดได้</p>
        )}
        {enrollments.length > 0 && !reviewableEnrollments.length && (
          <p className="muted small">คุณรีวิวทุกภาคการศึกษาที่เคยเรียนแล้ว ลบรีวิวเดิมก่อนหากต้องการเขียนใหม่</p>
        )}
      </section>

      <section>
        <div className="course-content-tabs">
          <button
            type="button"
            className={activeTab === "reviews" ? "course-tab active" : "course-tab"}
            onClick={() => setActiveTab("reviews")}
          >
            💬 รีวิวทั้งหมด ({reviews.length})
          </button>
          <button
            type="button"
            className={activeTab === "files" ? "course-tab active" : "course-tab"}
            onClick={() => setActiveTab("files")}
          >
            📁 ไฟล์สรุปทั้งหมด ({summaryFiles.length})
          </button>
          <Link
            className="btn btn-ghost course-see-more"
            to={activeTab === "reviews" ? `/course/${id}/reviews` : `/course/${id}/summary-files`}
          >
            ดูทั้งหมด →
          </Link>
        </div>

        {activeTab === "reviews" && (
          <div className="course-tab-panel">
            {!reviews.length ? (
              <div className="card empty-state">ยังไม่มีรีวิวในวิชานี้ — มาเขียนรีวิวแรกเลย!</div>
            ) : (
              reviews.slice(0, 3).map((review) => (
                <ReviewCard
                  key={review.review_id}
                  review={review}
                  user={user}
                  onReport={handleReport}
                  reportingId={reportingId}
                  onDeleted={handleReviewDeleted}
                  onUpdated={handleReviewUpdated}
                />
              ))
            )}
          </div>
        )}

        {activeTab === "files" && (
          <div className="course-tab-panel summary-file-list">
            {!summaryFiles.length ? (
              <div className="card empty-state">ยังไม่มีไฟล์สรุปในวิชานี้ — มาแชร์ไฟล์แรกเลย!</div>
            ) : (
              summaryFiles.slice(0, 3).map((file) => (
                <SummaryFileCard
                  key={file.file_id}
                  file={file}
                  user={user}
                  onRemoved={(fileId) => setSummaryFiles((current) => current.filter((item) => item.file_id !== fileId))}
                />
              ))
            )}
          </div>
        )}
      </section>

      {reviewModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setReviewModalOpen(false)}>
          <div className="card modal-card" role="dialog" aria-modal="true" aria-labelledby="review-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <h2 id="review-modal-title">เขียนรีวิว {course.course_code}</h2>
                <p className="muted">เลือกภาคการศึกษาที่เคยเรียนและให้คะแนนให้ครบ</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setReviewModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div>
                <label htmlFor="enrollment">ภาคการศึกษาที่ลงทะเบียนเรียน</label>
                <select id="enrollment" value={selectedEnrollmentId} onChange={(event) => setSelectedEnrollmentId(event.target.value)}>
                  {reviewableEnrollments.map((enrollment) => (
                    <option key={enrollment.enrollment_id} value={enrollment.enrollment_id}>
                      {enrollment.academic_year} / เทอม {enrollment.semester} / sec {enrollment.section}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="content">ความคิดเห็น</label>
                <textarea id="content" rows={4} placeholder="วิชานี้เป็นอย่างไรบ้าง?" value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} required />
              </div>
              <RatingForm ratings={form.ratings} onChange={(ratings) => setForm((current) => ({ ...current, ratings }))} />
              <div className="form-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setReviewModalOpen(false)}>ยกเลิก</button>
                <button type="submit" disabled={submitting}>{submitting ? "กำลังส่ง…" : "ส่งรีวิว"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {uploadModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setUploadModalOpen(false)}>
          <div className="card modal-card" role="dialog" aria-modal="true" aria-labelledby="upload-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <h2 id="upload-modal-title">อัปโหลดไฟล์สรุป {course.course_code}</h2>
                <p className="muted">หนึ่งรอบได้สูงสุด 3 ไฟล์ และใช้ได้ 2 รอบต่อปี/เทอม</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setUploadModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSummaryUpload}>
              <div>
                <label htmlFor="summary-enrollment">ภาคการศึกษาที่เคยเรียน</label>
                <select id="summary-enrollment" value={selectedUploadEnrollmentId} onChange={(event) => setSelectedUploadEnrollmentId(event.target.value)}>
                  {enrollments.map((enrollment) => (
                    <option key={enrollment.enrollment_id} value={enrollment.enrollment_id}>
                      {enrollment.academic_year} / เทอม {enrollment.semester} / sec {enrollment.section}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="summary-files">เลือกไฟล์ (สูงสุด 3 ไฟล์ต่อรอบ)</label>
                <input key={summaryFileInputKey} id="summary-files" type="file" multiple accept={SUMMARY_FILE_EXTENSIONS.join(",")} onChange={selectSummaryFiles} required />
                <p className="muted small">PDF, PNG, JPG, DOC, DOCX, PPT, PPTX · ไม่เกิน 20MB ต่อไฟล์</p>
                {selectedSummaryFiles.length > 0 && <p className="small">เลือกแล้ว {selectedSummaryFiles.length} ไฟล์</p>}
              </div>
              {summaryModalError && <div className="alert alert-error">{summaryModalError}</div>}
              <div className="form-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setUploadModalOpen(false)}>ยกเลิก</button>
                <button type="submit" disabled={summaryUploading || !selectedSummaryFiles.length}>{summaryUploading ? "กำลังอัปโหลด…" : "อัปโหลดไฟล์"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
