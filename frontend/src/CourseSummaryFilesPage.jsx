import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./AuthContext.jsx";
import SummaryFileCard from "./components/SummaryFileCard.jsx";


export default function CourseSummaryFilesPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([api(`/courses/${id}`), api(`/courses/${id}/summary-files`)])
      .then(([courseData, fileData]) => {
        setCourse(courseData);
        setFiles(fileData.files || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const groups = useMemo(() => {
    const result = new Map();
    files.forEach((file) => {
      const key = `${file.academic_year}-${file.semester}`;
      if (!result.has(key)) result.set(key, []);
      result.get(key).push(file);
    });
    return [...result.entries()];
  }, [files]);

  if (loading) return <p className="muted">กำลังโหลดไฟล์สรุป…</p>;

  return (
    <section>
      <Link to={`/course/${id}`} className="back-link">← กลับไปหน้ารายวิชา</Link>
      <div className="page-heading-row">
        <div>
          <span className="badge">{course?.course_code}</span>
          <h1>ไฟล์สรุปทั้งหมด</h1>
          <p className="muted">{course?.course_name}</p>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {!groups.length ? (
        <div className="card empty-state">ยังไม่มีไฟล์สรุปในวิชานี้</div>
      ) : (
        <div className="summary-year-groups">
          {groups.map(([key, rows]) => (
            <section className="summary-year-group" key={key}>
              <div className="summary-year-heading">
                <h2>ปีการศึกษา {rows[0].academic_year} / เทอม {rows[0].semester}</h2>
                <span className="count-pill">{rows.length} ไฟล์</span>
              </div>
              <div className="summary-file-list">
                {rows.map((file) => (
                  <SummaryFileCard
                    key={file.file_id}
                    file={file}
                    user={user}
                    onRemoved={(fileId) => setFiles((current) => current.filter((item) => item.file_id !== fileId))}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
