import { useState } from "react";
import { Link } from "react-router-dom";
import { api, summaryFileDownloadUrl } from "../api.js";
import Avatar from "../Avatar.jsx";


function formatSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}


export default function SummaryFileCard({ file, user, showCourse = false, onRemoved }) {
  const [liked, setLiked] = useState(Boolean(file.user_liked));
  const [likeCount, setLikeCount] = useState(Number(file.like_count) || 0);
  const [comments, setComments] = useState(file.comments || []);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const canDelete = user?.role === "ADMIN" || user?.user_id === file.uploader_id;

  async function toggleLike() {
    setBusy("like");
    setError("");
    try {
      const result = await api(`/summary-files/${file.file_id}/like`, { method: "POST" });
      setLiked(result.liked);
      setLikeCount(result.like_count);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    if (!comment.trim()) return;
    setBusy("comment");
    setError("");
    try {
      const created = await api(`/summary-files/${file.file_id}/comments`, {
        method: "POST",
        body: { content: comment.trim() },
      });
      setComments((current) => [...current, created]);
      setComment("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function reportFile() {
    if (!window.confirm("รายงานไฟล์นี้ว่าไม่เหมาะสมใช่หรือไม่?")) return;
    setBusy("report");
    setError("");
    try {
      const result = await api(`/summary-files/${file.file_id}/report`, { method: "POST" });
      if (result.auto_hidden) onRemoved?.(file.file_id);
      else window.alert(`รายงานแล้ว (${result.report_count}/5)`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function deleteFile() {
    if (!window.confirm("ลบไฟล์นี้ใช่หรือไม่?")) return;
    setBusy("delete");
    setError("");
    try {
      await api(`/summary-files/${file.file_id}`, { method: "DELETE" });
      onRemoved?.(file.file_id);
    } catch (err) {
      setError(err.message);
      setBusy("");
    }
  }

  return (
    <article className="card summary-file-card">
      <div className="summary-file-main">
        <div className="summary-file-icon">📄</div>
        <div>
          <a className="summary-file-name" href={summaryFileDownloadUrl(file.file_id)} download>
            {file.filename}
          </a>
          <div className="meta summary-file-meta">
            {showCourse && (
              <Link to={`/course/${file.course_id}`}>
                {file.course_code} · {file.course_name}
              </Link>
            )}
            <span>ปี {file.academic_year} / เทอม {file.semester}</span>
            <span>{formatSize(file.size_bytes)}</span>
          </div>
          <div className="summary-file-uploader">
            <Avatar url={file.uploader_avatar} size={20} />
            <span>อัปโหลดโดย {file.uploader_name}</span>
          </div>
        </div>
      </div>

      <div className="summary-file-actions">
        <button
          type="button"
          className={`btn btn-like ${liked ? "btn-like-active" : ""}`}
          onClick={toggleLike}
          disabled={Boolean(busy)}
        >
          {liked ? "♥" : "♡"} {likeCount}
        </button>
        <button type="button" className="btn btn-danger-outline" onClick={reportFile} disabled={Boolean(busy)}>
          ⚑ รายงาน
        </button>
        {canDelete && (
          <button type="button" className="btn btn-danger-outline" onClick={deleteFile} disabled={Boolean(busy)}>
            {busy === "delete" ? "…" : "🗑 ลบ"}
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      <div className="comment-thread summary-comments">
        {comments.map((item) => (
          <div className="comment-row" key={item.comment_id}>
            <Link to={`/profile/${item.author_id}`} className="comment-author">
              <Avatar url={item.author_avatar} size={16} />
              {item.author_name}
            </Link>
            <span className="comment-content">{item.content}</span>
          </div>
        ))}
        <form className="comment-form" onSubmit={submitComment}>
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="แสดงความคิดเห็นเกี่ยวกับไฟล์นี้…"
            maxLength={2000}
          />
          <button type="submit" className="btn btn-ghost" disabled={busy === "comment" || !comment.trim()}>
            {busy === "comment" ? "…" : "ส่ง"}
          </button>
        </form>
      </div>
    </article>
  );
}
