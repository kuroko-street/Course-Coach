import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./AuthContext.jsx";

// รายการปีการศึกษาที่ต้องการจัดกลุ่ม Section
const ACADEMIC_SECTIONS = [
  "2567 / เทอม 2",
  "2567 / เทอม 1",
  "2566 / เทอม 2",
  "2566 / เทอม 1",
];

// คอมโพเนนต์การ์ดแสดงไฟล์
function FileCardItem({ file, user }) {
  const fileId = file.file_id || file.id;

  return (
    <div
      className="card"
      style={{
        padding: "16px",
        borderRadius: "8px",
        background: "#fff",
        border: "1px solid #e0e0e0",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px",
      }}
    >
      <div>
        <h4 style={{ margin: "0 0 6px 0", fontSize: "1em", color: "#333" }}>
          📄 {file.filename || "ไฟล์สรุปรายวิชา"}
        </h4>
        <div style={{ fontSize: "0.85em", color: "#666", display: "flex", gap: "12px" }}>
          <span>📘 วิชา: {file.course_name || file.course_code || "ไม่ระบุวิชา"}</span>
          <span>👤 โดย: {file.uploader_name || "สมาชิก"}</span>
          <span>♥ {file.like_count || 0} Likes</span>
        </div>
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
          whiteSpace: "nowrap",
        }}
      >
        ⬇️ ดาวน์โหลด
      </a>
    </div>
  );
}

export default function SummaryFiles() {
  const { user } = useAuth();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchAllSummaryFiles() {
      setLoading(true);
      setError("");
      try {
        // ดึงไฟล์สรุปทั้งหมดในระบบ (หรือปรับ endpoint ตาม backend ของคุณ)
        const data = await api("/summary-files");
        setFiles(data.files || data || []);
      } catch (err) {
        console.error("Failed to load summary files:", err);
        setError("ไม่สามารถโหลดข้อมูลไฟล์สรุปได้");
      } finally {
        setLoading(false);
      }
    }

    fetchAllSummaryFiles();
  }, []);

  // ฟังก์ชันช่วยจัดกลุ่มไฟล์ตามปีการศึกษา
  const getFilesByAcademicYear = (yearSemester) => {
    return files.filter((file) => file.academic_year === yearSemester);
  };

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "20px" }}>
      {/* Navigation & Title */}
      <Link to="/" className="back-link" style={{ textDecoration: "none", color: "#0066cc", fontWeight: "bold" }}>
        ← กลับไปหน้าหลัก
      </Link>

      <div style={{ marginTop: "16px", marginBottom: "32px" }}>
        <h1 style={{ margin: "0 0 8px 0", fontSize: "1.8em" }}>📁 ไฟล์สรุปการเรียนทั้งหมด</h1>
        <p className="muted" style={{ margin: 0, color: "#666" }}>
          รวบรวมไฟล์ชีทสรุปและเอกสารประกอบการเรียน แยกตามปีการศึกษา
        </p>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: "20px" }}>{error}</div>}

      {loading ? (
        <p className="muted">กำลังโหลดข้อมูลไฟล์สรุป…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          {/* วนลูปสร้าง Section ตามแต่ละปีการศึกษา */}
          {ACADEMIC_SECTIONS.map((yearSem) => {
            const sectionFiles = getFilesByAcademicYear(yearSem);

            return (
              <section
                key={yearSem}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "20px",
                  background: "#fafafa",
                }}
              >
                {/* Header ของ Section ปีการศึกษา */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: "2px solid #e0e0e0",
                    paddingBottom: "10px",
                    marginBottom: "16px",
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: "1.25em", color: "#2d3748", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>🎓</span> ปีการศึกษา {yearSem}
                  </h2>
                  <span
                    style={{
                      background: "#e2e8f0",
                      color: "#4a5568",
                      fontSize: "0.85em",
                      fontWeight: "bold",
                      padding: "2px 10px",
                      borderRadius: "12px",
                    }}
                  >
                    {sectionFiles.length} รายการ
                  </span>
                </div>

                {/* รายการไฟล์ใน Section */}
                {sectionFiles.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {sectionFiles.map((file) => (
                      <FileCardItem key={file.file_id || file.id} file={file} user={user} />
                    ))}
                  </div>
                ) : (
                  /* Empty State ถ้ายังไม่มีไฟล์ในเทอมนี้ */
                  <div
                    style={{
                      textAlign: "center",
                      padding: "24px",
                      background: "#fff",
                      borderRadius: "8px",
                      border: "1px dashed #cbd5e0",
                      color: "#a0aec0",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: "0.95em" }}>
                      ยังไม่มีไฟล์สรุปในภาคการศึกษา {yearSem}
                    </p>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}