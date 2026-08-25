import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiUpload, fileDownloadUrl } from "./api.js";
import {RatingBreakdown,RatingForm,ratingsFromReview,StarDisplay,} from "./RatingStars.jsx";
import Avatar from "./Avatar.jsx";

const MAX_FILE_MB = 20;

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One review, fully self-contained: rating breakdown, like, comments, file
 * attachments, and (for the author) edit/delete. Report stays owned by the
 * parent (CourseDetail) since a successful report can make the whole card
 * disappear from the ACTIVE list.
 */
export default function ReviewCard({
  review,
  user,
  onReport,
  reportingId,
  onDeleted,
  onUpdated,
}) {
  const isOwner = user && user.user_id === review.reviewer_id;
  const reviewRatings = ratingsFromReview(review);

  const [liked, setLiked] = useState(Boolean(review.liked_by_me));
  const [likeCount, setLikeCount] = useState(Number(review.like_count) || 0);
  const [likeBusy, setLikeBusy] = useState(false);

  const [comments, setComments] = useState([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  const [files, setFiles] = useState([]);

  const [editing, setEditing] = useState(false);
  const [showRatings, setShowRatings] = useState(false);
 const [editForm, setEditForm] = useState(() => ({
  content: review.content,
  academic_year: String(review.academic_year),
  semester: review.semester,
  section: review.section,
  ratings: ratingsFromReview(review),
  difficulty: Number(review.rating_difficulty) || 3,
}));
  const [editFile, setEditFile] = useState(null);
  const [editFileInputKey, setEditFileInputKey] = useState(0);
  const [editBusy, setEditBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    api(`/reviews/${review.review_id}/comments`)
      .then((data) => setComments(data.comments || []))
      .catch(() => {});
    api(`/reviews/${review.review_id}/files`)
      .then((data) => setFiles(data.files || []))
      .catch(() => {});
  }, [review.review_id]);

  async function toggleLike() {
    if (!user || likeBusy) return;
    setLikeBusy(true);
    setError("");
    try {
      const data = liked
        ? await api(`/reviews/${review.review_id}/like`, {
            method: "DELETE",
            userId: user.user_id,
          })
        : await api(`/reviews/${review.review_id}/like`, {
            method: "POST",
            userId: user.user_id,
          });
      setLiked(data.liked);
      setLikeCount(data.like_count);
    } catch (err) {
      setError(err.message);
    } finally {
      setLikeBusy(false);
    }
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!commentDraft.trim() || !user) return;
    setCommentBusy(true);
    setError("");
    try {
      const created = await api(`/reviews/${review.review_id}/comments`, {
        method: "POST",
        userId: user.user_id,
        body: { content: commentDraft.trim() },
      });
      setComments((prev) => [...prev, created]);
      setCommentDraft("");
    } catch (err) {
      setError(err.message);
    } finally {
      setCommentBusy(false);
    }
  }

  function startEdit() {
    setEditForm({
      content: review.content,
      academic_year: String(review.academic_year),
      semester: review.semester,
      section: review.section,
      ratings: ratingsFromReview(review),
      difficulty: Number(review.rating_difficulty) || 3,
    });
    setEditFile(null);
    setError("");
    setEditing(true);
  }

  function cancelEdit() {
    setEditFile(null);
    setEditing(false);
  }

  async function submitEdit(e) {
    e.preventDefault();
    if (editFile && editFile.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`ไฟล์ต้องมีขนาดไม่เกิน ${MAX_FILE_MB}MB`);
      return;
    }
    setEditBusy(true);
    setError("");
    const body = {
      content: editForm.content.trim(),
      academic_year: Number(editForm.academic_year),
      semester: editForm.semester.trim(),
      section: editForm.section.trim(),

      rating_satisfaction: editForm.ratings.satisfaction,
      rating_skill: editForm.ratings.skill,
      rating_workload: editForm.ratings.workload,
      rating_content: editForm.ratings.content,
      rating_teaching: editForm.ratings.teaching,
      rating_exam: editForm.ratings.exam,
      rating_recommendation: editForm.ratings.recommendation,
      rating_difficulty: editForm.difficulty,
};
    try {
      await api(`/reviews/${review.review_id}`, {
        method: "PUT",
        userId: user.user_id,
        body,
      });
      onUpdated(review.review_id, {
        ...body,
        rating_satisfaction: body.rating_satisfaction,
        edited_at: new Date().toISOString(),
      });

      if (editFile) {
        try {
          const created = await apiUpload(`/reviews/${review.review_id}/files`, {
            file: editFile,
            userId: user.user_id,
          });
          setFiles((prev) => [created, ...prev]);
        } catch (err) {
          setError(`บันทึกรีวิวสำเร็จ แต่แนบไฟล์ไม่สำเร็จ: ${err.message}`);
        }
      }

      setEditFile(null);
      setEditFileInputKey((k) => k + 1);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("ลบรีวิวนี้ใช่หรือไม่? การลบไม่สามารถย้อนกลับได้")) return;
    setDeleteBusy(true);
    setError("");
    try {
      await api(`/reviews/${review.review_id}`, {
        method: "DELETE",
        userId: user.user_id,
      });
      onDeleted(review.review_id);
    } catch (err) {
      setError(err.message);
      setDeleteBusy(false);
    }
  }

  if (editing) {
    return (
      <form className="card review-card" onSubmit={submitEdit}>
        <h3 className="edit-title">แก้ไขรีวิว #{review.review_id}</h3>
        {error && <div className="alert alert-error">{error}</div>}
        <div>
          <label htmlFor={`edit-content-${review.review_id}`}>ความคิดเห็น</label>
          <textarea
            id={`edit-content-${review.review_id}`}
            rows={4}
            value={editForm.content}
            onChange={(e) => setEditForm((f) => ({ ...f, content: e.target.value }))}
            required
          />
        </div>
        <div className="row row-3">
          <div>
            <label>ปีการศึกษา</label>
            <input
              value={editForm.academic_year}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, academic_year: e.target.value }))
              }
              required
            />
          </div>
          <div>
            <label>เทอม</label>
            <input
              value={editForm.semester}
              onChange={(e) => setEditForm((f) => ({ ...f, semester: e.target.value }))}
              required
            />
          </div>
          <div>
            <label>Section</label>
            <input
              value={editForm.section}
              onChange={(e) => setEditForm((f) => ({ ...f, section: e.target.value }))}
              required
            />
          </div>
        </div>
        <RatingForm
          ratings={editForm.ratings}
          onChange={(ratings) => setEditForm((f) => ({ ...f, ratings }))}
        />
        <div>
          <label htmlFor={`edit-file-${review.review_id}`}>
            แนบไฟล์เอกสารเพิ่มเติม (ถ้ามี, สูงสุด {MAX_FILE_MB}MB)
          </label>
          <input
            key={editFileInputKey}
            id={`edit-file-${review.review_id}`}
            type="file"
            onChange={(e) => setEditFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="form-footer">
          <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
            ยกเลิก
          </button>
          <button type="submit" disabled={editBusy}>
            {editBusy ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
          </button>
        </div>
      </form>
    );
  }

  return (
  <div className="card review-card">
  {/* ฝั่งซ้าย */}
  <div className="review-main">
    <div className="review-summary-top">
      <p className="review-content">
        "{review.content}"
      </p>

      <button
        type="button"
        className={`review-expand-btn ${showRatings ? "open" : ""}`}
        onClick={() => setShowRatings((prev) => !prev)}
        aria-expanded={showRatings}
        aria-label={
          showRatings
            ? "ซ่อนรายละเอียดคะแนน"
            : "ดูรายละเอียดคะแนน"
        }
      >
        ›
      </button>
    </div>

   <span className="review-rating-title">
      ความพึงพอใจโดยรวม
  </span>

    <div className="rating-score">
      <StarDisplay
        value={Math.round(Number(reviewRatings.satisfaction))}
      />

      <strong>
        {Number(reviewRatings.satisfaction).toFixed(1)}
      </strong>
    </div>
    

    {/* Footer เดิม */}
    <div className="review-footer">
      <div className="meta reviewer-meta">
        โดย{" "}

        <Link
          to={`/profile/${review.reviewer_id}`}
          className="reviewer-link"
        >
          <Avatar
            url={review.reviewer_avatar}
            size={18}
          />

          {review.reviewer_name}
        </Link>{" "}

        · {review.academic_year}/{review.semester}
        · sec {review.section}

        {review.edited_at && (
          <span className="muted small-inline">
            {" "}· แก้ไขแล้ว
          </span>
        )}

        {review.report_count > 0 && (
          <span className="report-count">
            {" "}· reported {review.report_count}/5
          </span>
        )}
      </div>

      <div className="review-actions">
        <button
          type="button"
          className={`btn btn-like ${
            liked ? "btn-like-active" : ""
          }`}
          onClick={toggleLike}
          disabled={!user || likeBusy}
          title={
            user
              ? "ถูกใจรีวิวนี้"
              : "เข้าสู่ระบบเพื่อกดถูกใจ"
          }
        >
          {liked ? "♥" : "♡"} {likeCount}
        </button>

        {isOwner && (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={startEdit}
            >
              ✎ แก้ไข
            </button>

            <button
              type="button"
              className="btn btn-danger-outline"
              onClick={handleDelete}
              disabled={deleteBusy}
            >
              {deleteBusy ? "…" : "🗑 ลบ"}
            </button>
          </>
        )}

        <button
          type="button"
          className="btn btn-danger-outline"
          onClick={() => onReport(review.review_id)}
          disabled={reportingId !== null}
        >
          {reportingId === review.review_id
            ? "Reporting…"
            : "⚑ Report"}
        </button>
      </div>
    </div>

    {error && (
      <div className="alert alert-error">
        {error}
      </div>
    )}

  {/* Comments (FR-13) */}
<div className="comment-thread">
  {comments.map((c) => (
    <div className="comment-row" key={c.comment_id}>
      <Link
        to={`/profile/${c.author_id}`}
        className="comment-author"
      >
        <Avatar url={c.author_avatar} size={16} />
        {c.author_name}
      </Link>

      <span className="comment-content">
        {c.content}
      </span>
    </div>
  ))}

  {user ? (
    <form
      className="comment-form"
      onSubmit={submitComment}
    >
      <input
        type="text"
        placeholder="แสดงความคิดเห็น / สอบถามผู้เขียนรีวิว…"
        value={commentDraft}
        onChange={(e) => setCommentDraft(e.target.value)}
      />

      <button
        type="submit"
        className="btn btn-ghost"
        disabled={commentBusy}
      >
        {commentBusy ? "…" : "ส่ง"}
      </button>
    </form>
  ) : (
    <p className="muted small">
      เข้าสู่ระบบเพื่อแสดงความคิดเห็น
    </p>
  )}
</div>

</div> {/* ปิด review-main */}


{/* ฝั่งขวา */}
{showRatings && (
  <div
    className="rating-modal-overlay"
    onMouseDown={(e) => {
      if (e.target === e.currentTarget) {
        setShowRatings(false);
      }
    }}
  >
    <div
      className="rating-modal"
      role="dialog"
      aria-modal="true"
      aria-label="รายละเอียดคะแนนรีวิว"
    >
      <div className="rating-modal-header">
        <strong>คะแนนรายด้าน</strong>

        <button
          type="button"
          className="rating-modal-close"
          onClick={() => setShowRatings(false)}
          aria-label="ปิด"
        >
          ×
        </button>
      </div>
      
      <RatingBreakdown ratings={reviewRatings} />
      <div className="rating-row">
        <span className="rating-label">
          การแนะนำรายวิชา
        </span>

        <div className="rating-score">
          <StarDisplay
            value={Math.round(reviewRatings.recommendation)}
          />

          <strong>
            {Number(reviewRatings.recommendation).toFixed(1)}
          </strong>
        </div>
      </div>

      <div className="rating-row">
        <span className="rating-label">
          ระดับความยาก
        </span>

        <strong>
          {Number(review.rating_difficulty).toFixed(1)} / 5
        </strong>
      </div>
          </div>
        </div>
      )}

      </div>
);
}

