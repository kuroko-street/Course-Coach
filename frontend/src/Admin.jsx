import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiUpload } from "./api.js";
import { useAuth } from "./AuthContext.jsx";

const emptyCourse = { course_code: "", course_name: "", department: "", prerequisites: "", syllabus: "", teaching_format: "", workload: "", assessment: "", tags_text: "", instructor_names: [], curriculum_mappings: [] };
const emptyMapping = () => ({ curriculum_id: "", recommended_year: "1", recommended_semester: "1", requirement_type: "REQUIRED" });

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState("reports");
  const [reviews, setReviews] = useState([]);
  const [reportSummary, setReportSummary] = useState({ pending_count: 0, reviewed_count: 0 });
  const [queueOpen, setQueueOpen] = useState(true);
  const [courses, setCourses] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [curriculums, setCurriculums] = useState([]);
  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [importPreview, setImportPreview] = useState(null);
  const [curriculumForm, setCurriculumForm] = useState({ curriculum_name: "", academic_year: "2569", department: "", degree_level: "ปริญญาตรี" });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [reportData, summaryData, courseData, curriculumData, instructorData] = await Promise.all([
        api("/admin/reports", { userId: user.user_id }), api("/admin/reports/summary", { userId: user.user_id }), api("/admin/courses", { userId: user.user_id }), api("/admin/curriculums", { userId: user.user_id }), api("/admin/instructors", { userId: user.user_id }),
      ]);
      setReviews(reportData.reviews || []); setReportSummary(summaryData); setCourses(courseData.courses || []); setCurriculums(curriculumData.curriculums || []); setInstructors(instructorData.instructors || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [user.user_id]);
  useEffect(() => { load(); }, [load]);
  function flash(message) { setError(""); setSuccess(message); }

  async function handleAction(reviewId, action) {
    setBusyId(`review-${reviewId}`);
    try { const data = await api(`/admin/reviews/${reviewId}/action`, { method: "POST", userId: user.user_id, body: { action } }); flash(`รีวิว #${reviewId}: ${data.message}`); await load(); }
    catch (err) { setError(err.message); } finally { setBusyId(null); }
  }
  function startEdit(course) {
    setEditingId(course.course_id);
    setCourseForm({
      ...emptyCourse,
      ...course,
      tags_text: (course.tags || []).join(", "),
      instructor_names: course.instructors || [],
      curriculum_mappings: (course.curriculum_mappings || []).map((mapping) => ({
        curriculum_id: String(mapping.curriculum_id),
        recommended_year: String(mapping.recommended_year),
        recommended_semester: mapping.recommended_semester,
        requirement_type: mapping.requirement_type,
      })),
    });
    setTab("courses"); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function saveCourse(event) {
    event.preventDefault(); setBusyId("course-form");
    try {
      const { curriculum_mappings: formMappings, tags_text, instructor_names, ...base } = courseForm;
      const curriculum_mappings = formMappings.filter((mapping) => mapping.curriculum_id).map((mapping) => ({
        curriculum_id: Number(mapping.curriculum_id),
        recommended_year: Number(mapping.recommended_year),
        recommended_semester: mapping.recommended_semester,
        requirement_type: mapping.requirement_type,
      }));
      const tag_names = [...new Set(tags_text.split(",").map((tag) => tag.trim()).filter(Boolean))];
      const data = await api(editingId ? `/admin/courses/${editingId}` : "/admin/courses", { method: editingId ? "PUT" : "POST", userId: user.user_id, body: { ...base, curriculum_mappings, tag_names, instructor_names } });
      flash(data.message); setCourseForm(emptyCourse); setEditingId(null); await load();
    } catch (err) { setError(err.message); } finally { setBusyId(null); }
  }
  function updateMapping(index, key, value) {
    setCourseForm((current) => ({
      ...current,
      curriculum_mappings: current.curriculum_mappings.map((mapping, mappingIndex) =>
        mappingIndex === index ? { ...mapping, [key]: value } : mapping
      ),
    }));
  }
  function removeMapping(index) {
    setCourseForm((current) => ({
      ...current,
      curriculum_mappings: current.curriculum_mappings.filter((_, mappingIndex) => mappingIndex !== index),
    }));
  }
  async function createInstructor(name) {
    const data = await api("/admin/instructors", { method: "POST", userId: user.user_id, body: { name } });
    setInstructors((current) => [...current, data.instructor].sort((a, b) => a.name.localeCompare(b.name, "th")));
    setCourseForm((current) => ({ ...current, instructor_names: [...current.instructor_names, data.instructor.name] }));
  }
  async function toggleCourse(course) {
    setBusyId(`course-${course.course_id}`);
    try { const data = await api(`/admin/courses/${course.course_id}/status`, { method: "PATCH", userId: user.user_id, body: { is_active: !course.is_active } }); flash(`${course.course_code}: ${data.message}`); await load(); }
    catch (err) { setError(err.message); } finally { setBusyId(null); }
  }
  async function saveCurriculum(event) {
    event.preventDefault(); setBusyId("curriculum-form");
    try { const data = await api("/admin/curriculums", { method: "POST", userId: user.user_id, body: { ...curriculumForm, academic_year: Number(curriculumForm.academic_year) } }); flash(`${data.curriculum.curriculum_name} ถูกเพิ่มแล้ว`); setCurriculumForm({ curriculum_name: "", academic_year: "2569", department: "", degree_level: "ปริญญาตรี" }); await load(); }
    catch (err) { setError(err.message); } finally { setBusyId(null); }
  }
  async function previewImport(event) {
    event.preventDefault();
    const file = event.target.elements.excel_file.files[0];
    if (!file) { setError("เลือกไฟล์ Excel ก่อน"); return; }
    setBusyId("import-preview"); setError(""); setSuccess("");
    try {
      const data = await apiUpload("/admin/courses/import/preview", { file, userId: user.user_id });
      setImportPreview(data);
    } catch (err) { setError(err.message); setImportPreview(null); } finally { setBusyId(null); }
  }
  async function confirmImport() {
    if (!importPreview || importPreview.invalid_count) return;
    setBusyId("import-confirm");
    try {
      const data = await api("/admin/courses/import", { method: "POST", userId: user.user_id, body: { rows: importPreview.rows } });
      const skipped = data.results.filter((row) => row.operation === "skipped").length;
      flash(`ประมวลผล ${data.imported_count} รายการ · เพิ่ม/อัปเดต ${data.imported_count - skipped} · ข้ามข้อมูลที่ตรงกัน ${skipped}`); setImportPreview(null); await load();
    } catch (err) { setError(err.message); } finally { setBusyId(null); }
  }
  const setCourse = (key) => (value) => setCourseForm({ ...courseForm, [key]: value });
  const setCurriculum = (key) => (value) => setCurriculumForm({ ...curriculumForm, [key]: value });

  return <section>
    <h1>ผู้ดูแลระบบ</h1><p className="muted">ตรวจสอบรีวิว และจัดการข้อมูลรายวิชา/หลักสูตรสำหรับหน้า Catalog</p>
    <div className="admin-tabs"><button className={tab === "reports" ? "admin-tab active" : "admin-tab"} onClick={() => setTab("reports")}>คิวรีวิว ({reviews.length})</button><button className={tab === "courses" ? "admin-tab active" : "admin-tab"} onClick={() => setTab("courses")}>จัดการรายวิชา</button><button className={tab === "curriculums" ? "admin-tab active" : "admin-tab"} onClick={() => setTab("curriculums")}>หลักสูตร</button><button className={tab === "import" ? "admin-tab active" : "admin-tab"} onClick={() => setTab("import")}>Import Excel</button></div>
    {error && <div className="alert alert-error">{error}</div>}{success && <div className="alert alert-success">{success}</div>}
    {tab === "reports" && <Reports loading={loading} reviews={reviews} summary={reportSummary} queueOpen={queueOpen} onToggleQueue={() => setQueueOpen((open) => !open)} busyId={busyId} onAction={handleAction} />}
    {tab === "courses" && <>
      <h2>{editingId ? `แก้ไขรายวิชา #${editingId}` : "เพิ่มรายวิชา"}</h2>
      <form className="card" onSubmit={saveCourse}>
        <div className="row"><Field label="รหัสวิชา" value={courseForm.course_code} onChange={setCourse("course_code")} required /><Field label="ชื่อวิชา" value={courseForm.course_name} onChange={setCourse("course_name")} required /></div><Field label="ภาควิชา" value={courseForm.department} onChange={setCourse("department")} required />
        <div className="curriculum-mapping-editor">
          <div className="mapping-heading"><label>หลักสูตรที่ใช้รายวิชานี้ (ไม่บังคับ)</label><button type="button" className="btn btn-ghost" onClick={() => setCourseForm((current) => ({ ...current, curriculum_mappings: [...current.curriculum_mappings, emptyMapping()] }))}>＋ เพิ่มหลักสูตร</button></div>
          {courseForm.curriculum_mappings.map((mapping, index) => <div className="curriculum-mapping-row" key={`${mapping.curriculum_id}-${index}`}>
            <Select label="หลักสูตร" value={mapping.curriculum_id} onChange={(value) => updateMapping(index, "curriculum_id", value)}><option value="">เลือกหลักสูตร</option>{curriculums.map((c) => <option value={c.curriculum_id} key={c.curriculum_id}>{c.curriculum_name} ({c.academic_year})</option>)}</Select>
            <Select label="ประเภทวิชา" value={mapping.requirement_type} onChange={(value) => updateMapping(index, "requirement_type", value)}><option value="REQUIRED">วิชาบังคับ</option><option value="ELECTIVE">วิชาเลือก</option></Select>
            <Field label="ชั้นปีแนะนำ" type="number" value={mapping.recommended_year} onChange={(value) => updateMapping(index, "recommended_year", value)} required />
            <Field label="เทอมแนะนำ" value={mapping.recommended_semester} onChange={(value) => updateMapping(index, "recommended_semester", value)} required />
            <button type="button" className="btn btn-danger-outline mapping-remove" onClick={() => removeMapping(index)}>ลบ</button>
          </div>)}
          {!courseForm.curriculum_mappings.length && <small className="muted">ยังไม่ได้ผูกกับหลักสูตรใด</small>}
        </div>
        <TextField label="วิชาบังคับก่อน" value={courseForm.prerequisites} onChange={setCourse("prerequisites")} /><TextField label="คำอธิบาย/เนื้อหา" value={courseForm.syllabus} onChange={setCourse("syllabus")} /><InstructorPicker value={courseForm.instructor_names} options={instructors} onChange={(value) => setCourseForm({ ...courseForm, instructor_names: value })} onCreate={createInstructor} /><Field label="Tags (คั่นด้วย comma)" value={courseForm.tags_text} onChange={setCourse("tags_text")} />
        <div className="form-footer"><button disabled={busyId !== null}>{busyId === "course-form" ? "กำลังบันทึก…" : editingId ? "บันทึกการแก้ไข" : "เพิ่มรายวิชา"}</button>{editingId && <button type="button" className="btn btn-ghost" onClick={() => { setEditingId(null); setCourseForm(emptyCourse); }}>ยกเลิก</button>}</div>
      </form><h2>รายวิชาทั้งหมด</h2>{loading ? <p className="muted">Loading courses…</p> : <CourseList courses={courses} busyId={busyId} onEdit={startEdit} onToggle={toggleCourse} />}
    </>}
    {tab === "curriculums" && <><h2>เพิ่มหลักสูตร</h2><form className="card" onSubmit={saveCurriculum}><div className="row"><Field label="ชื่อหลักสูตร" value={curriculumForm.curriculum_name} onChange={setCurriculum("curriculum_name")} required /><Field label="ปีหลักสูตร" type="number" value={curriculumForm.academic_year} onChange={setCurriculum("academic_year")} required /></div><div className="row"><Field label="ภาควิชา" value={curriculumForm.department} onChange={setCurriculum("department")} required /><Field label="ระดับ" value={curriculumForm.degree_level} onChange={setCurriculum("degree_level")} required /></div><button disabled={busyId !== null}>{busyId === "curriculum-form" ? "กำลังบันทึก…" : "เพิ่มหลักสูตร"}</button></form><h2>หลักสูตรที่ใช้งาน</h2><div className="admin-list">{curriculums.map((c) => <article className="card" key={c.curriculum_id}><strong>{c.curriculum_name} ({c.academic_year})</strong><div className="meta">{c.department} · {c.degree_level}</div></article>)}</div></>}
    {tab === "import" && <><h2>นำเข้ารายวิชาจาก Excel</h2><p className="muted">อัปโหลด .xlsx สูงสุด 5MB ระบบจะตรวจข้อมูลและแสดง preview ก่อนบันทึกจริง</p><a className="btn btn-ghost" href="/course-import-template.xlsx" download>ดาวน์โหลดไฟล์ตัวอย่าง</a><form className="card import-form" onSubmit={previewImport}><div><label>ไฟล์ Excel (.xlsx)</label><input name="excel_file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /></div><button disabled={busyId !== null}>{busyId === "import-preview" ? "กำลังตรวจสอบ…" : "ตรวจสอบไฟล์"}</button></form>{importPreview && <div className="card"><h2>ตัวอย่างข้อมูลก่อนนำเข้า</h2><p className={importPreview.invalid_count ? "warn" : "muted"}>ใช้ได้ {importPreview.valid_count} แถว · ผิด {importPreview.invalid_count} แถว</p><div className="import-table-wrap"><table className="import-table"><thead><tr><th>แถว</th><th>วิชา</th><th>หลักสูตร</th><th>ปี/เทอม</th><th>ผลตรวจ</th></tr></thead><tbody>{importPreview.rows.map((row) => <tr key={row.row_number}><td>{row.row_number}</td><td><strong>{row.course_code}</strong><br />{row.course_name}</td><td>{row.curriculum_name} ({row.curriculum_year})</td><td>{row.recommended_year}/{row.recommended_semester}</td><td>{row.errors.length ? <span className="import-error">{row.errors.join(", ")}</span> : row.operation === "skip" ? <span className="import-skip">ข้อมูลตรงกัน — ข้าม</span> : row.operation === "update" ? <span className="import-update">มีอยู่แล้ว — อัปเดต</span> : <span className="import-ok">รายวิชาใหม่ — เพิ่ม</span>}</td></tr>)}</tbody></table></div><div className="admin-actions"><button disabled={busyId !== null || importPreview.invalid_count > 0} onClick={confirmImport}>{busyId === "import-confirm" ? "กำลังนำเข้า…" : `ยืนยันนำเข้า ${importPreview.valid_count} รายการ`}</button>{importPreview.invalid_count > 0 && <span className="muted">แก้ไขแถวที่ผิดใน Excel แล้วอัปโหลดใหม่</span>}</div></div>}</>}
  </section>;
}

function Reports({ loading, reviews, summary, queueOpen, onToggleQueue, busyId, onAction }) {
  if (loading) return <p className="muted">Loading queue…</p>;
  return <>
    <div className="moderation-summary" aria-label="สรุปการตรวจสอบรีวิว">
      <div className="summary-card summary-pending"><span>รีวิวที่ต้องตรวจสอบ</span><strong>{summary.pending_count}</strong><small>รายการรอดำเนินการ</small></div>
      <div className="summary-card summary-reviewed"><span>ตรวจสอบแล้ว</span><strong>{summary.reviewed_count}</strong><small>รายการที่ Admin ตัดสินแล้ว</small></div>
    </div>
    <section className="review-queue">
      <button type="button" className="queue-toggle" onClick={onToggleQueue} aria-expanded={queueOpen}><span>รีวิวที่ต้องตรวจสอบ <span className="queue-count">{reviews.length}</span></span><span className="queue-chevron" aria-hidden="true">{queueOpen ? "⌃" : "⌄"}</span></button>
      {queueOpen && (!reviews.length ? <div className="card empty-state"><strong>คิวว่าง 🎉</strong><p className="muted">ไม่มีรีวิวที่รอตรวจสอบในขณะนี้</p></div> : <div className="admin-list">{reviews.map((r) => <article className="card admin-card" key={r.review_id}><div className="admin-card-head"><div><span className="badge">{r.course_code}</span><Link to={`/course/${r.course_id}`} className="admin-course">{r.course_name}</Link></div><span className="report-badge">{r.report_count} reports</span></div><blockquote className="admin-quote">{r.content}</blockquote><div className="meta">review #{r.review_id} · โดย {r.reviewer_name} · {r.academic_year}/{r.semester} · sec {r.section}</div><div className="admin-actions"><button className="btn btn-keep" disabled={busyId !== null} onClick={() => onAction(r.review_id, "KEEP")}>{busyId === `review-${r.review_id}` ? "…" : "✓ Keep"}</button><button className="btn btn-delete" disabled={busyId !== null} onClick={() => onAction(r.review_id, "DELETE")}>{busyId === `review-${r.review_id}` ? "…" : "🗑 Delete"}</button></div></article>)}</div>)}
    </section>
  </>;
}
function CourseList({ courses, busyId, onEdit, onToggle }) { return <div className="admin-list">{courses.map((course) => <article className="card course-admin-card" key={course.course_id}><div><span className="badge">{course.course_code}</span><strong>{course.course_name}</strong>{!course.is_active && <span className="status-inactive">ซ่อนจาก Catalog</span>}<div className="meta">{course.department}</div>{course.instructors?.length > 0 && <div className="meta">ผู้สอน: {course.instructors.join(", ")}</div>}{course.curriculum_mappings?.map((m) => <div className="curriculum-chip" key={m.curriculum_id}>{m.curriculum_name} {m.academic_year} · ปี {m.recommended_year} / เทอม {m.recommended_semester} · {m.requirement_type === "REQUIRED" ? "บังคับ" : "เลือก"}</div>)}{course.tags?.map((tag) => <span className="tag-chip tag-chip-static" key={tag}>{tag}</span>)}</div><div className="admin-actions"><button className="btn btn-ghost" onClick={() => onEdit(course)} disabled={busyId !== null}>แก้ไข</button><button className={course.is_active ? "btn btn-danger-outline" : "btn btn-keep"} onClick={() => onToggle(course)} disabled={busyId !== null}>{busyId === `course-${course.course_id}` ? "…" : course.is_active ? "ซ่อนวิชา" : "เปิดใช้"}</button></div></article>)}</div>; }
function InstructorPicker({ value, options, onChange, onCreate }) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = new Set(value);
  const filtered = options.filter((instructor) => instructor.name.toLowerCase().includes(query.trim().toLowerCase()) && !selected.has(instructor.name)).slice(0, 8);
  function select(name) { onChange([...value, name]); setQuery(""); }
  function remove(name) { onChange(value.filter((item) => item !== name)); }
  async function addInstructor() {
    if (!newName.trim()) return;
    setBusy(true);
    try { await onCreate(newName.trim()); setNewName(""); setAdding(false); } catch (err) { window.alert(err.message); } finally { setBusy(false); }
  }
  return <div className="instructor-picker"><label>อาจารย์ผู้สอน</label><div className="instructor-input-wrap">{value.map((name) => <span className="instructor-chip" key={name}>{name}<button type="button" aria-label={`ลบ ${name}`} onClick={() => remove(name)}>×</button></span>)}<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={value.length ? "ค้นหาเพิ่ม…" : "พิมพ์เพื่อค้นหาอาจารย์…"} /></div>{query.trim() && <div className="instructor-options">{filtered.map((instructor) => <button type="button" key={instructor.instructor_id} onClick={() => select(instructor.name)}>{instructor.name}</button>)}{!filtered.length && <span className="instructor-no-result">ไม่พบอาจารย์ชื่อนี้</span>}</div>}<button type="button" className="btn btn-ghost instructor-add-toggle" onClick={() => setAdding((open) => !open)}>＋ เพิ่มอาจารย์ใหม่</button>{adding && <div className="instructor-add-form"><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="ชื่ออาจารย์" maxLength="255" required /><button type="button" onClick={addInstructor} disabled={busy}>{busy ? "กำลังเพิ่ม…" : "เพิ่มและเลือก"}</button></div>}<small className="muted">เลือกได้หลายคน · ค้นหาจากรายชื่อที่มีอยู่</small></div>; }
function Field({ label, value, onChange, type = "text", required = false }) { return <div><label>{label}</label><input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} required={required} min={type === "number" ? 1 : undefined} /></div>; }
function TextField({ label, value, onChange }) { return <div><label>{label}</label><textarea rows="2" value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></div>; }
function Select({ label, value, onChange, children }) { return <div><label>{label}</label><select value={value} onChange={(e) => onChange(e.target.value)}>{children}</select></div>; }
