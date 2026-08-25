import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api.js";
import { RatingBreakdown, RatingForm, ratingsFromReview } from "./RatingStars.jsx";
import Avatar from "./Avatar.jsx";

/**
 * One review, fully self-contained: rating breakdown, like, comments, and
 * (for the author) edit/delete. Report stays owned by the
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

  const [liked, setLiked] = useState(Boolean(review.liked_by_me));
  const [likeCount, setLikeCount] = useState(Number(review.like_count) || 0);
  const [likeBusy, setLikeBusy] = useState(false);

  const [comments, setComments] = useState([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(() => ({
    content: review.content,
    academic_year: String(review.academic_year),
    semester: review.semester,
    section: review.section,
    ratings: ratingsFromReview(review),
  }));
  const [editBusy, setEditBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    api(`/reviews/${review.review_id}/comments`)
      .then((data) => setComments(data.comments || []))
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
    });
    setError("");
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function submitEdit(e) {
    e.preventDefault();
    setEditBusy(true);
    setError("");
    const body = {
      content: editForm.content.trim(),
      academic_year: Number(editForm.academic_year),
      semester: editForm.semester.trim(),
      section: editForm.section.trim(),
      rating_satisfaction: editForm.ratings.satisfaction,
      rating_recommendation: editForm.ratings.recommendation,
      rating_workload: editForm.ratings.workload,
      rating_content: editForm.ratings.content,
      rating_teaching: editForm.ratings.teaching,
      rating_exam: editForm.ratings.exam,
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
      <p className="review-content">{review.content}</p>

      <RatingBreakdown ratings={ratingsFromReview(review)} />

      <div className="review-footer">
        <div className="meta reviewer-meta">
          โดย{" "}
          <Link to={`/profile/${review.reviewer_id}`} className="reviewer-link">
            <Avatar url={review.reviewer_avatar} size={18} />
            {review.reviewer_name}
          </Link>{" "}
          · {review.academic_year}/{review.semester} · sec {review.section}
          {review.edited_at && <span className="muted small-inline"> · แก้ไขแล้ว</span>}
          {review.report_count > 0 && (
            <span className="report-count"> · reported {review.report_count}/5</span>
          )}
        </div>

        <div className="review-actions">
          <button
            type="button"
            className={`btn btn-like ${liked ? "btn-like-active" : ""}`}
            onClick={toggleLike}
            disabled={!user || likeBusy}
            title={user ? "ถูกใจรีวิวนี้" : "เข้าสู่ระบบเพื่อกดถูกใจ"}
          >
            {liked ? "♥" : "♡"} {likeCount}
          </button>

          {isOwner && (
            <>
              <button type="button" className="btn btn-ghost" onClick={startEdit}>
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
            {reportingId === review.review_id ? "Reporting…" : "⚑ Report"}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Comments (FR-13) */}
      <div className="comment-thread">
        {comments.map((c) => (
          <div className="comment-row" key={c.comment_id}>
            <Link to={`/profile/${c.author_id}`} className="comment-author">
              <Avatar url={c.author_avatar} size={16} />
              {c.author_name}
            </Link>
            <span className="comment-content">{c.content}</span>
          </div>
        ))}
        {user ? (
          <form className="comment-form" onSubmit={submitComment}>
            <input
              type="text"
              placeholder="แสดงความคิดเห็น / สอบถามผู้เขียนรีวิว…"
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
            />
            <button type="submit" className="btn btn-ghost" disabled={commentBusy}>
              {commentBusy ? "…" : "ส่ง"}
            </button>
          </form>
        ) : (
          <p className="muted small">เข้าสู่ระบบเพื่อแสดงความคิดเห็น</p>
        )}
      </div>
    </div>
  );
}
