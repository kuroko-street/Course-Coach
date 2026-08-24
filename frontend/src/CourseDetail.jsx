import React, { useEffect, useState } from "react";
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
const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx", ".ppt", ".pptx"];
const ACADEMIC_YEARS = ["2566 / เทอม 1", "2566 / เทอม 2", "2567 / เทอม 1", "2567 / เทอม 2"];

// คอมโพเนนต์การ์ดแสดงผลไฟล์สรุปที่อัปโหลดแล้ว
function SummaryFileCard({ file, user, onReportFile, onDeleteFile }) {
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState(file.comments || []);
  const [likes, setLikes] = useState(file.like_count || 0);
  const [isLiked, setIsLiked] = useState(file.user_liked || false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const isOwner = user?.user_id === file.uploader_id || user?.username === file.uploader_name;
  const fileId = file.file_id || file.id;

  const handleLike = async () => {
    try {
      const res = await api(`/summary-files/${fileId}/like`, {
        method: "POST",
        userId: user?.user_id,
      });
      setLikes(res.like_count ?? (isLiked ? likes - 1 : likes + 1));
      setIsLiked(!isLiked);
    } catch (err) {
      console.error("Like file error:", err);
      setLikes(isLiked ? likes - 1 : likes + 1);
      setIsLiked(!isLiked);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || isSubmittingComment) return;

    setIsSubmittingComment(true);
    const newCommentObj = {
      comment_id: Date.now(),
      username: user?.username || "คุณ",
      content: commentText.trim(),
    };

    try {
      await api(`/summary-files/${fileId}/comments`, {
        method: "POST",
        userId: user?.user_id,
        body: { content: commentText.trim() },
      });
      setComments((prev) => [...prev, newCommentObj]);
      setCommentText("");
    } catch (err) {
      console.error("Comment file error:", err);
      alert("เกิดข้อผิดพลาดในการส่งความคิดเห็น");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  return (
    <div className="card" style={{ padding: "20px", marginBottom: "16px", borderRadius: "10px", background: "#fff", border: "1px solid #eaeaea" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <div>
          <h4 style={{ margin: "0 0 6px 0", fontSize: "1.05em", color: "#222", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📄</span> {file.filename || "ไฟล์สรุปรายวิชา"}
          </h4>
        </div>
        <a
          href={file.download_url || `/api/files/${fileId}/download`}
          download
          style={{
            padding: "6px 14px",
            borderRadius: "6px",
            backgroundColor: "#0066cc",
            color: "#fff",
            textDecoration: "none",
            fontSize: "0.85em",
            fontWeight: "bold",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px"
          }}
        >
          ⬇️ ดาวน์โหลด
        </a>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "1px solid #f0f0f0", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ fontSize: "0.85em", color: "#777", display: "flex", alignItems: "center", gap: "6px" }}>
          <span>โดย</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#eee", padding: "2px 8px", borderRadius: "12px", color: "#333", fontWeight: "bold" }}>
            👤 {file.uploader_name || file.username || "สมาชิก"}
          </span>
          <span>• {file.academic_year || "ปีการศึกษาล่าสุด"}</span>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={handleLike}
            style={{
              padding: "4px 12px",
              borderRadius: "16px",
              border: "1px solid #f8b4b4",
              background: isLiked ? "#ffebe8" : "#fff0f0",
              color: "#d9534f",
              cursor: "pointer",
              fontSize: "0.85em",
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}
          >
            ♥ {likes}
          </button>
          
          <button
            type="button"
            onClick={() => onReportFile && onReportFile(fileId)}
            style={{
              padding: "4px 12px",
              borderRadius: "6px",
              border: "1px solid #e0e0e0",
              background: "#fff",
              color: "#d9534f",
              cursor: "pointer",
              fontSize: "0.85em",
              fontWeight: "bold"
            }}
          >
            🚩 Report
          </button>

          {isOwner && (
            <button
              type="button"
              onClick={() => onDeleteFile && onDeleteFile(fileId)}
              style={{
                padding: "4px 12px",
                borderRadius: "6px",
                border: "1px solid #e0e0e0",
                background: "#f8f9fa",
                color: "#6c757d",
                cursor: "pointer",
                fontSize: "0.85em",
                fontWeight: "bold"
              }}
            >
              🗑️ ลบ
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: "14px", paddingTop: "10px", borderTop: "1px solid #f5f5f5" }}>
        {comments.map((c) => (
          <div key={c.comment_id || c.id} style={{ fontSize: "0.85em", padding: "6px 0", color: "#444", display: "flex", gap: "6px" }}>
            <span style={{ fontWeight: "bold", color: "#333" }}>👤 {c.username}:</span>
            <span>{c.content}</span>
          </div>
        ))}

        <form onSubmit={handleAddComment} style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <input
            type="text"
            placeholder="แสดงความคิดเห็นเกี่ยวกับไฟล์นี้..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            disabled={isSubmittingComment}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid #e0e0e0",
              fontSize: "0.85em",
              outline: "none"
            }}
          />
          <button
            type="submit"
            disabled={isSubmittingComment || !commentText.trim()}
            style={{
              padding: "6px 16px",
              borderRadius: "8px",
              border: "none",
              background: isSubmittingComment ? "#ccc" : "#f0f0f0",
              color: "#333",
              fontSize: "0.85em",
              cursor: isSubmittingComment ? "not-allowed" : "pointer",
              fontWeight: "bold"
            }}
          >
            ส่ง
          </button>
        </form>
      </div>
    </div>
  );
}

export default function CourseDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [course, setCourse] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [summaryFiles, setSummaryFiles] = useState([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reportingId, setReportingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // แท็บสำหรับสลับหน้าจอระหว่าง "reviews" กับ "files"
  const [activeTab, setActiveTab] = useState("reviews");
  
  // Review Modal State
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState("");
  const [form, setForm] = useState({
    content: "",
    ratings: defaultRatings(),
  });
  const [reviewFile, setReviewFile] = useState(null);
  const [reviewFileInputKey, setReviewFileInputKey] = useState(0);

  // Upload File Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(ACADEMIC_YEARS[0]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [uploadFileInputKey, setUploadFileInputKey] = useState(Date.now());

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

  async function loadSummaryFiles() {
    try {
      const data = await api(`/courses/${id}/summary-files`);
      setSummaryFiles(data.files || data || []);
    } catch (err) {
      console.error("Error fetching summary files:", err);
    }
  }

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadCourse(), loadReviews(), loadEnrollments(), loadSummaryFiles()]);
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

  // --- Handlers for Reviews ---
  async function handleSubmitReview(e) {
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
      setIsReviewModalOpen(false);
      await Promise.all([loadReviews(), loadEnrollments()]);
    } catch (err) {
      setError(`Submission failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReportReview(reviewId) {
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
          ? `รีวิว #${reviewId} ถูกซ่อนอัตโนมัติ และส่งเข้าคิวผู้ดูแลระบบแล้ว`
          : `รายงานรีวิว #${reviewId} แล้ว`
      );
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

  // --- Handlers for Summary Files ---
  const handleFileChange = (e) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) {
      setSelectedFiles([]);
      setModalError("");
      return;
    }

    if (fileList.length > 3) {
      setModalError("สามารถเลือกอัปโหลดได้สูงสุดไม่เกิน 3 ไฟล์ต่อครั้ง");
      setSelectedFiles([]);
      setUploadFileInputKey(Date.now());
      return;
    }

    let invalidError = "";
    for (const file of fileList) {
      const ext = "." + file.name.split(".").pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        invalidError = `ไฟล์ "${file.name}" ผิดประเภท! (อนุญาต: ${ALLOWED_EXTENSIONS.join(", ")})`;
        break;
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        invalidError = `ไฟล์ "${file.name}" มีขนาดเกิน ${MAX_FILE_MB}MB`;
        break;
      }
    }

    if (invalidError) {
      setModalError(invalidError);
      setSelectedFiles([]);
      setUploadFileInputKey(Date.now());
    } else {
      setModalError("");
      setSelectedFiles(fileList);
    }
  };

  const handleModalUploadSubmit = async (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0 || modalError) return;

    setUploading(true);
    setModalError("");
    setError("");
    setSuccess("");

    const formData = new FormData();
    formData.append("academic_year", selectedYear);
    selectedFiles.forEach((file) => formData.append("files", file));

    try {
      await apiUpload(`/courses/${id}/summary-files`, {
        body: formData,
        userId: user?.user_id,
      });
      setSelectedFiles([]);
      setUploadFileInputKey(Date.now());
      setIsUploadModalOpen(false);
      setSuccess("อัปโหลดไฟล์สรุปเรียบร้อยแล้ว");
      loadSummaryFiles();
    } catch (err) {
      setModalError(err.message || "เกิดข้อผิดพลาดในการอัปโหลด");
    } finally {
      setUploading(false);
    }
  };

  async function handleReportFile(fileId) {
    setError("");
    setSuccess("");
    try {
      await api(`/summary-files/${fileId}/report`, {
        method: "POST",
        userId: user.user_id,
      });
      setSuccess(`รายงานไฟล์สรุป #${fileId} เรียบร้อยแล้ว`);
    } catch (err) {
      setError(`Report file failed: ${err.message}`);
    }
  }

  async function handleDeleteFile(fileId) {
    if (!window.confirm("คุณแน่ใจหรือไม่ว่าต้องการลบไฟล์สรุปนี้?")) return;
    setError("");
    setSuccess("");
    try {
      await api(`/summary-files/${fileId}`, {
        method: "DELETE",
        userId: user.user_id,
      });
      setSuccess(`ลบไฟล์สรุปเรียบร้อยแล้ว`);
      loadSummaryFiles();
    } catch (err) {
      setError(`Delete file failed: ${err.message}`);
    }
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

  const isUploadButtonDisabled = selectedFiles.length === 0 || !!modalError || uploading;

  return (
    <>
      <Link to="/" className="back-link">
        ← Back to catalog
      </Link>

      {/* Course Header */}
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

      {error && <div className="alert alert-error" style={{ marginBottom: "16px" }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: "16px" }}>{success}</div>}

      {/* 1. Deep Course Detail */}
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

      {/* 2. Rating Averages */}
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

      {/* 3. Instructors */}
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

      {/* 4. Term Offerings */}
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

      {/* ========================================================= */}
      {/* 5. ส่วนที่ 1: ปุ่มสำหรับการเขียนรีวิว และ อัปโหลดไฟล์ (แยกต่างหาก) */}
      {/* ========================================================= */}
      <section style={{ borderTop: "2px solid #eee", paddingTop: "24px", marginTop: "32px" }}>
        <h2 style={{ fontSize: "1.2em", marginBottom: "16px" }}>มีส่วนร่วมกับวิชานี้</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          
          {/* การ์ดปุ่มเขียนรีวิว */}
          {enrollments.length > 0 ? (
            <div 
              onClick={() => setIsReviewModalOpen(true)}
              style={{ 
                border: "1px dashed #d9534f", 
                borderRadius: "10px", 
                padding: "16px 20px", 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                cursor: "pointer",
                background: "#fff9f9"
              }}
            >
              <div>
                <div style={{ fontWeight: "bold", color: "#d9534f", fontSize: "1.05em" }}>✏️ เขียนรีวิววิชานี้</div>
                <div style={{ fontSize: "0.85em", color: "#666", marginTop: "2px" }}>แชร์ประสบการณ์และให้คะแนน</div>
              </div>
              <span style={{ background: "#d9534f", color: "#fff", padding: "6px 12px", borderRadius: "6px", fontSize: "0.85em", fontWeight: "bold" }}>+ รีวิว</span>
            </div>
          ) : (
            <div className="card empty-state" style={{ margin: 0, padding: "16px" }}>
              <strong style={{ fontSize: "0.95em" }}>สิทธิ์รีวิวเฉพาะผู้เคยลงเรียน</strong>
              <p className="muted" style={{ margin: 0, fontSize: "0.8em" }}>
                ไม่พบประวัติการลงทะเบียนเรียนวิชานี้ของคุณ
              </p>
            </div>
          )}

          {/* การ์ดปุ่มอัปโหลดไฟล์ */}
          <div 
            onClick={() => setIsUploadModalOpen(true)}
            style={{ 
              border: "1px dashed #0066cc", 
              borderRadius: "10px", 
              padding: "16px 20px", 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              cursor: "pointer",
              background: "#f4f8ff"
            }}
          >
            <div>
              <div style={{ fontWeight: "bold", color: "#0066cc", fontSize: "1.05em" }}>📤 อัปโหลดไฟล์สรุป</div>
              <div style={{ fontSize: "0.85em", color: "#555", marginTop: "2px" }}>แบ่งปันชีทสรุปหรือไฟล์เรียน</div>
            </div>
            <span style={{ background: "#0066cc", color: "#fff", padding: "6px 12px", borderRadius: "6px", fontSize: "0.85em", fontWeight: "bold" }}>+ อัปโหลด</span>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 6. ส่วนที่ 2: แท็บคู่กดสลับดู รีวิว / ไฟล์ที่อัปโหลดไว้แล้ว + ปุ่ม See More */}
      {/* ========================================================= */}
      <section style={{ marginTop: "32px" }}>
        {/* แท็บข้อความเคียงข้างกัน + ปุ่ม See More ด้านขวา */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #e0e0e0", marginBottom: "20px" }}>
          
          <div style={{ display: "flex", gap: "24px" }}>
            <h2
              onClick={() => setActiveTab("reviews")}
              style={{
                margin: 0,
                cursor: "pointer",
                fontSize: "1.25em",
                color: activeTab === "reviews" ? "#0066cc" : "#888",
                borderBottom: activeTab === "reviews" ? "3px solid #0066cc" : "3px solid transparent",
                paddingBottom: "10px",
                marginBottom: "-2px",
                transition: "all 0.2s"
              }}
            >
              💬 รีวิวทั้งหมด ({reviews.length})
            </h2>

            <h2
              onClick={() => setActiveTab("files")}
              style={{
                margin: 0,
                cursor: "pointer",
                fontSize: "1.25em",
                color: activeTab === "files" ? "#0066cc" : "#888",
                borderBottom: activeTab === "files" ? "3px solid #0066cc" : "3px solid transparent",
                paddingBottom: "10px",
                marginBottom: "-2px",
                transition: "all 0.2s"
              }}
            >
              📁 ไฟล์สรุปทั้งหมด ({summaryFiles.length})
            </h2>
          </div>

          {/* ปุ่ม See More (แสดงเฉพาะตอนเปิดแท็บไฟล์สรุป) */}
          {activeTab === "files" && (
            <Link
              to="/summary-files"
              style={{
                fontSize: "0.85em",
                fontWeight: "bold",
                color: "#0066cc",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 10px",
                borderRadius: "6px",
                border: "1px solid #0066cc",
                marginBottom: "8px",
                transition: "all 0.2s"
              }}
            >
              See more →
            </Link>
          )}

        </div>

        {/* เนื้อหาแท็บ 1: รายการรีวิว */}
        {activeTab === "reviews" && (
          <div>
            {reviews.length === 0 ? (
              <p className="muted">ยังไม่มีรีวิว — เป็นคนแรกเลย!</p>
            ) : (
              reviews.map((r) => (
                <ReviewCard
                  key={r.review_id}
                  review={r}
                  user={user}
                  onReport={handleReportReview}
                  reportingId={reportingId}
                  onDeleted={handleReviewDeleted}
                  onUpdated={handleReviewUpdated}
                />
              ))
            )}
          </div>
        )}

        {/* เนื้อหาแท็บ 2: รายการไฟล์สรุป */}
        {activeTab === "files" && (
          <div>
            {summaryFiles.length === 0 ? (
              <div className="card empty-state" style={{ textAlign: "center", padding: "24px", color: "#777" }}>
                ยังไม่มีไฟล์สรุปในวิชานี้ — มาร่วมแชร์ไฟล์คนแรกเลย!
              </div>
            ) : (
              summaryFiles.map((file) => (
                <SummaryFileCard
                  key={file.file_id || file.id}
                  file={file}
                  user={user}
                  onReportFile={handleReportFile}
                  onDeleteFile={handleDeleteFile}
                />
              ))
            )}
          </div>
        )}
      </section>

      {/* MODAL 1: Pop-up เขียนรีวิว */}
      {isReviewModalOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 99999
        }}>
          <div style={{ 
            background: "#fff", borderRadius: "12px", padding: "24px", 
            width: "90%", maxWidth: "600px", maxHeight: "90vh", overflowY: "auto", position: "relative" 
          }}>
            <button 
              type="button" 
              onClick={() => setIsReviewModalOpen(false)}
              style={{ position: "absolute", top: "16px", right: "16px", border: "none", background: "transparent", fontSize: "18px", cursor: "pointer" }}
            >
              ✕
            </button>

            <h3 style={{ margin: "0 0 16px 0", fontSize: "1.2em" }}>เขียนรีวิวรายวิชา</h3>

            <form onSubmit={handleSubmitReview} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label htmlFor="modal-enrollment" style={{ fontWeight: "bold", fontSize: "0.9em", display: "block", marginBottom: "4px" }}>
                  ภาคการศึกษาที่ลงทะเบียนเรียน
                </label>
                <select
                  id="modal-enrollment"
                  value={selectedEnrollmentId}
                  onChange={(e) => setSelectedEnrollmentId(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
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
                <label htmlFor="modal-content" style={{ fontWeight: "bold", fontSize: "0.9em", display: "block", marginBottom: "4px" }}>
                  ความคิดเห็น
                </label>
                <textarea
                  id="modal-content"
                  rows={4}
                  placeholder="วิชานี้เป็นอย่างไรบ้าง?"
                  value={form.content}
                  onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                  required
                />
              </div>

              <RatingForm
                ratings={form.ratings}
                onChange={(ratings) => setForm((prev) => ({ ...prev, ratings }))}
              />

              <div>
                <label htmlFor="modal-review-file" style={{ fontWeight: "bold", fontSize: "0.9em", display: "block", marginBottom: "4px" }}>
                  แนบไฟล์เอกสารสรุป/ชีทเรียน (ถ้ามี, สูงสุด {MAX_FILE_MB}MB)
                </label>
                <input
                  key={reviewFileInputKey}
                  id="modal-review-file"
                  type="file"
                  onChange={(e) => setReviewFile(e.target.files?.[0] ?? null)}
                  style={{ width: "100%", padding: "6px", border: "1px solid #ccc", borderRadius: "6px" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", borderTop: "1px solid #eee", paddingTop: "12px" }}>
                <span style={{ fontSize: "0.85em", color: "#666" }}>
                  กำลังเขียนในนาม <strong>{user?.username}</strong>
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button 
                    type="button" 
                    onClick={() => setIsReviewModalOpen(false)}
                    style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "#dc3545", color: "#fff", cursor: "pointer", fontWeight: "bold" }}
                  >
                    ยกเลิก
                  </button>
                  <button 
                    type="submit" 
                    disabled={submitting}
                    style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "#0066cc", color: "#fff", cursor: "pointer", fontWeight: "bold" }}
                  >
                    {submitting ? "กำลังส่ง…" : "ส่งรีวิว"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Pop-up อัปโหลดไฟล์สรุป */}
      {isUploadModalOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 99999
        }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", width: "90%", maxWidth: "420px", position: "relative" }}>
            <button 
              type="button" 
              onClick={() => { 
                setIsUploadModalOpen(false); 
                setModalError(""); 
                setSelectedFiles([]); 
                setUploadFileInputKey(Date.now()); 
              }}
              style={{ position: "absolute", top: "16px", right: "16px", border: "none", background: "transparent", fontSize: "18px", cursor: "pointer" }}
            >
              ✕
            </button>

            <h3 style={{ margin: "0 0 16px 0", fontSize: "1.15em" }}>อัปโหลดไฟล์สรุป</h3>

            <form onSubmit={handleModalUploadSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85em", fontWeight: "bold", marginBottom: "4px" }}>
                  เลือกปีการศึกษา / เทอม:
                </label>
                <select 
                  value={selectedYear} 
                  onChange={(e) => setSelectedYear(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                >
                  {ACADEMIC_YEARS.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85em", fontWeight: "bold", marginBottom: "4px" }}>
                  เลือกไฟล์ (สูงสุด 3 ไฟล์, ไม่เกิน {MAX_FILE_MB}MB ต่อไฟล์):
                </label>
                <input 
                  key={uploadFileInputKey}
                  type="file" 
                  multiple 
                  onChange={handleFileChange}
                  accept={ALLOWED_EXTENSIONS.join(",")}
                  style={{ width: "100%", padding: "6px", border: "1px solid #ccc", borderRadius: "6px" }}
                />
              </div>

              {modalError && (
                <div style={{ color: "#d9534f", fontSize: "0.85em", background: "#fdf7f7", padding: "8px", borderRadius: "6px", border: "1px solid #f8b4b4" }}>
                  {modalError}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
                <button 
                  type="button" 
                  onClick={() => {
                    setIsUploadModalOpen(false);
                    setModalError("");
                    setSelectedFiles([]);
                    setUploadFileInputKey(Date.now());
                  }}
                  style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "#ccc", color: "#333", cursor: "pointer", fontWeight: "bold" }}
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  disabled={isUploadButtonDisabled}
                  style={{ 
                    padding: "8px 16px", 
                    borderRadius: "6px", 
                    border: "none", 
                    background: isUploadButtonDisabled ? "#99c2ff" : "#0066cc", 
                    color: "#fff", 
                    cursor: isUploadButtonDisabled ? "not-allowed" : "pointer", 
                    fontWeight: "bold" 
                  }}
                >
                  {uploading ? "กำลังอัปโหลด..." : "ตกลง"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}